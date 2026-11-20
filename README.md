# Lê Beautiful — loja virtual

Projeto inicial de loja virtual com catálogo, carrinho, finalização pelo WhatsApp e painel administrativo protegido no servidor.

## Requisitos
- Node.js 20 ou superior
- HTTPS na hospedagem de produção
- Hospedagem que mantenha armazenamento persistente para SQLite e uploads (ou adaptar para banco/armazenamento gerenciado)

## Rodar localmente
1. Instale o Node.js.
2. Na pasta do projeto, execute `npm install`.
3. Copie `.env.example` para `.env`.
4. Edite `.env`: defina `SESSION_SECRET` com uma chave aleatória longa e mantenha `ADMIN_USER=Yuri`.
5. Execute `npm run setup` e escolha uma senha forte (mínimo 10 caracteres). O programa grava somente o hash no `.env`.
6. Execute `npm start`.
7. Acesse `http://localhost:3000`.

**Não use a senha curta 2525 em produção.** Ela é fácil de adivinhar. O projeto não grava senha em arquivos públicos nem a envia ao navegador.

## Publicar online
Use um serviço de hospedagem Node.js que suporte armazenamento persistente. Configure as variáveis de ambiente `SESSION_SECRET`, `ADMIN_USER`, `ADMIN_PASSWORD_HASH`, `WHATSAPP_NUMBER` e `NODE_ENV=production`. Gere o hash da senha localmente com `npm run setup` e copie somente o valor de `ADMIN_PASSWORD_HASH` para as variáveis privadas da hospedagem. Configure HTTPS e domínio público. Não envie `.env`, `data/` ou `uploads/` para repositórios públicos.

Antes de publicar:
- confirme o número do WhatsApp em formato internacional, somente números;
- ajuste as regras de entrega para os bairros atendidos;
- teste pedido, taxa, login, upload e edição em celular;
- faça backup periódico do banco SQLite e das imagens.

## Observações
- A taxa inicial é de R$ 3,00, com opção de retirada/combinar sem taxa. A confirmação por bairro ainda deve ser configurada com os valores reais.
- O formulário solicita nome, telefone, rua, bairro e número; referência é opcional.
- O pedido é enviado ao WhatsApp após o cliente revisar e confirmar no próprio WhatsApp.
- Este é um projeto inicial: para operação comercial, recomenda-se adicionar proteção contra tentativas repetidas de login, política de privacidade, termos, backup automatizado e armazenamento de imagens gerenciado.
