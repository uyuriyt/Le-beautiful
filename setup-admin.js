require("dotenv").config();
const fs = require("fs");
const readline = require("readline");
const bcrypt = require("bcryptjs");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("Digite a senha forte que deseja usar no painel ADM: ", async (password) => {
  if (!password || password.length < 10) {
    console.log("Use uma senha com pelo menos 10 caracteres.");
    rl.close();
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  const envPath = ".env";
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  content = content.replace(/^ADMIN_PASSWORD_HASH=.*$/m, "");
  content += `\nADMIN_PASSWORD_HASH=${hash}\n`;
  if (!content.includes("ADMIN_USER=")) content += "ADMIN_USER=Yuri\n";
  fs.writeFileSync(envPath, content.trim() + "\n");
  console.log("Hash salvo no .env. Não publique nem compartilhe esse arquivo.");
  rl.close();
});
