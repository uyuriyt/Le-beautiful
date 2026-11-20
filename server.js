require("dotenv").config();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const dbDir = path.join(__dirname, "data");
const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(dbDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(path.join(dbDir, "store.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT DEFAULT '',
 price REAL NOT NULL, category TEXT DEFAULT 'Beleza', image TEXT DEFAULT '',
 active INTEGER DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);
const defaultSettings = {
  deliveryRules: JSON.stringify([
    { name: "Prado - região central", fee: 3 },
    { name: "Consultar disponibilidade", fee: 3 }
  ]),
  whatsapp: process.env.WHATSAPP_NUMBER || "5527995703451",
  city: process.env.STORE_CITY || "Prado - BA"
};
for (const [key, value] of Object.entries(defaultSettings)) {
  db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)").run(key, value);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: dbDir }),
  secret: process.env.SESSION_SECRET || "development-only-change-this-secret",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8*60*60*1000 }
}));
app.use("/uploads", express.static(uploadDir));
app.use(express.static(path.join(__dirname, "public")));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + "-" + Math.random().toString(36).slice(2) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype))
});

function adminOnly(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: "Faça login para continuar." });
}
function getSetting(key) {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
  return row ? row.value : "";
}

app.get("/api/products", (_req, res) => {
  const rows = db.prepare("SELECT id,name,description,price,category,image FROM products WHERE active=1 ORDER BY id DESC").all();
  res.json(rows);
});
app.get("/api/settings/public", (_req, res) => {
  res.json({ city: getSetting("city"), deliveryRules: JSON.parse(getSetting("deliveryRules") || "[]") });
});
app.post("/api/order", (req, res) => {
  const { customer, phone, street, neighborhood, number, reference, items, deliveryFee } = req.body || {};
  if (!customer || !phone || !street || !neighborhood || !number || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: "Preencha os dados obrigatórios e adicione produtos." });
  }
  const ids = items.map(x => Number(x.id)).filter(Number.isInteger);
  if (!ids.length) return res.status(400).json({ error: "Carrinho inválido." });
  const products = db.prepare(`SELECT id,name,price FROM products WHERE active=1 AND id IN (${ids.map(()=>"?").join(",")})`).all(...ids);
  const normalized = [];
  for (const item of items) {
    const p = products.find(x => x.id === Number(item.id));
    const qty = Math.max(1, Math.min(50, Number(item.quantity) || 1));
    if (p) normalized.push({ name: p.name, price: p.price, quantity: qty });
  }
  if (!normalized.length) return res.status(400).json({ error: "Os produtos não estão disponíveis." });
  const subtotal = normalized.reduce((s, x) => s + x.price*x.quantity, 0);
  const fee = Math.max(0, Math.min(3, Number(deliveryFee) || 0));
  const lines = normalized.map(x => `• ${x.name} x${x.quantity} — R$ ${(x.price*x.quantity).toFixed(2).replace(".",",")}`);
  const msg = [
    "Olá! Quero fazer um pedido na Lê Beautiful 💗",
    "", `Cliente: ${customer}`, `Telefone: ${phone}`,
    `Endereço: ${street}, nº ${number} — ${neighborhood}`,
    reference ? `Referência: ${reference}` : "",
    "", "Produtos:", ...lines,
    "", `Subtotal: R$ ${subtotal.toFixed(2).replace(".",",")}`,
    `Entrega: R$ ${fee.toFixed(2).replace(".",",")}`,
    `TOTAL: R$ ${(subtotal+fee).toFixed(2).replace(".",",")}`
  ].filter(Boolean).join("\n");
  const wa = getSetting("whatsapp") || process.env.WHATSAPP_NUMBER || "5527995703451";
  res.json({ whatsappUrl: `https://wa.me/${wa}?text=${encodeURIComponent(msg)}` });
});

app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body || {};
  const expectedUser = process.env.ADMIN_USER || "Yuri";
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (!hash) return res.status(503).json({ error: "Painel não configurado. Configure o ADMIN_PASSWORD_HASH no servidor." });
  const ok = username === expectedUser && await bcrypt.compare(password || "", hash);
  if (!ok) return res.status(401).json({ error: "Usuário ou senha incorretos." });
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: "Não foi possível iniciar a sessão." });
    req.session.isAdmin = true;
    res.json({ ok: true });
  });
});
app.post("/api/admin/logout", adminOnly, (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/admin/me", (req, res) => res.json({ authenticated: !!(req.session && req.session.isAdmin) }));
app.get("/api/admin/products", adminOnly, (_req, res) => {
  res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all());
});
app.post("/api/admin/products", adminOnly, upload.single("image"), (req, res) => {
  const { name, description="", price, category="Beleza", active="1" } = req.body;
  if (!name || !Number.isFinite(Number(price)) || Number(price) < 0) return res.status(400).json({ error: "Informe nome e preço válido." });
  const image = req.file ? "/uploads/" + req.file.filename : "";
  const info = db.prepare("INSERT INTO products(name,description,price,category,image,active) VALUES(?,?,?,?,?,?)")
    .run(name, description, Number(price), category, image, active === "1" ? 1 : 0);
  res.json({ id: info.lastInsertRowid });
});
app.put("/api/admin/products/:id", adminOnly, upload.single("image"), (req, res) => {
  const old = db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id);
  if (!old) return res.status(404).json({ error: "Produto não encontrado." });
  const { name, description="", price, category="Beleza", active="1" } = req.body;
  if (!name || !Number.isFinite(Number(price)) || Number(price) < 0) return res.status(400).json({ error: "Informe nome e preço válido." });
  const image = req.file ? "/uploads/" + req.file.filename : old.image;
  db.prepare("UPDATE products SET name=?,description=?,price=?,category=?,image=?,active=? WHERE id=?")
    .run(name, description, Number(price), category, image, active === "1" ? 1 : 0, req.params.id);
  res.json({ ok: true });
});
app.delete("/api/admin/products/:id", adminOnly, (req, res) => {
  db.prepare("DELETE FROM products WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});
app.put("/api/admin/settings", adminOnly, (req, res) => {
  const { deliveryRules, whatsapp } = req.body || {};
  if (Array.isArray(deliveryRules)) {
    db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('deliveryRules',?)").run(JSON.stringify(deliveryRules));
  }
  if (whatsapp && /^\d{10,15}$/.test(whatsapp)) {
    db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('whatsapp',?)").run(whatsapp);
  }
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`Lê Beautiful rodando na porta ${PORT}`));
