# Publicação: GitHub + Vercel + Neon

O projeto atual continua publicado enquanto esta nova infraestrutura é preparada.

## 1. Criar o banco limpo no Neon

1. Crie um projeto PostgreSQL no Neon na região mais próxima disponível.
2. Abra o **SQL Editor** do projeto.
3. Cole e execute todo o arquivo `neon/schema.sql`.
4. Copie a connection string do banco, sempre com SSL habilitado.

A connection string será usada como `DATABASE_URL`. Não a salve no GitHub.

## 2. Criar o repositório privado no GitHub

Crie um repositório privado chamado `onda-video-consulta`, sem README e sem arquivos iniciais. Depois, no terminal desta pasta:

```bash
git remote rename origin sites-backup
git remote add origin https://github.com/SEU_USUARIO/onda-video-consulta.git
git push -u origin main
```

O remoto `sites-backup` preserva a ligação com a publicação atual.

## 3. Importar o projeto na Vercel

1. Em **Add New > Project**, importe o repositório privado.
2. Mantenha o preset como **Other** e o comando de build como `npm run build`.
3. Adicione estas variáveis em Production, Preview e Development:

```text
DATABASE_URL=<connection string do Neon>
TOKEN_SECRET=<segredo longo e aleatório>
VET_EMAIL=veterinaria@onda-animal.com.br
VET_PASSWORD=<senha forte do painel>
VET_NAME=Dra. Bruna
VET_CRMV=<CRMV da veterinária>
VET_UNIT=Gravataí
PAYMENT_TEST_MODE=true
```

Para gerar `TOKEN_SECRET`, use um gerenciador de senhas ou:

```bash
openssl rand -base64 48
```

## 4. Criar o armazenamento privado de receitas

No projeto da Vercel, abra **Storage**, crie um **Blob** com acesso **Private** e conecte-o ao projeto. A Vercel adicionará `BLOB_READ_WRITE_TOKEN` automaticamente.

As receitas assinadas ficam privadas e só são entregues pela rota autenticada do sistema. Por causa do limite de requisição das Functions, o PDF pode ter até 4 MB.

## 5. Publicar e testar

Faça o primeiro deploy e valide, nesta ordem:

1. página pública e mascotes;
2. login da veterinária;
3. configuração e abertura de horários;
4. agendamento público com motivo, endereço, CEP, e-mail e CPF;
5. pagamento em modo de teste;
6. início da consulta e link do cliente;
7. salvamento e reabertura do prontuário;
8. upload e abertura de receita assinada.

Somente depois desses testes altere o domínio. Mantenha `PAYMENT_TEST_MODE=true` até as credenciais e o webhook Pix Banrisul estarem homologados.

