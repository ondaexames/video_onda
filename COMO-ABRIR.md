# Onda Animal — Vídeo Consulta

## Abrir o projeto

1. Instale o Node.js 22.5 ou mais recente.
2. Extraia este ZIP e abra a pasta no VS Code.
3. Abra o terminal dentro da pasta.
4. Execute:

```bash
npm install
npm run dev
```

5. Abra no navegador:

- Site do cliente: `http://localhost:3000`
- Painel veterinário: `http://localhost:3000/vet`
- Configurações: `http://localhost:3000/vet/configuracoes`

Login local inicial:

- E-mail: `veterinaria@onda-animal.com.br`
- Senha: `123456`

O servidor cria automaticamente um banco local dentro de `.local-data`. Para
encerrar, pressione `Ctrl + C` no terminal. O comando `npm run build` continua
disponível para gerar a versão pronta em `dist/`.

## Testar o pagamento sem cobrança

O comando `npm run dev` ativa automaticamente o modo de pagamento de teste:

1. Abra o site do cliente e escolha um horário.
2. Preencha o agendamento normalmente.
3. Na tela do Pix, clique em **Simular pagamento aprovado**.
4. Abra o painel veterinário: a consulta aparecerá como paga e pronta.
5. Inicie o atendimento no painel para liberar a entrada do cliente na sala.

Nenhum dinheiro é movimentado nesse teste. O botão de simulação não fica ativo
na versão publicada e não substitui a futura configuração do Asaas.

## Configuração

Copie `.env.example` para `.env` e preencha as chaves do login, Asaas e WhatsApp.

O sistema completo utiliza:

- banco D1 para tutores, animais, agenda e prontuários;
- armazenamento R2 para documentos;
- Asaas para pagamentos;
- WhatsApp Cloud API para os avisos.

As migrações do banco estão na pasta `drizzle/`.

## Estrutura principal

- `src/index.html`: telas e estilos;
- `src/app.js`: funcionamento do navegador;
- `worker/index.js`: API e regras do servidor;
- `db/schema.ts`: estrutura do banco;
- `drizzle/`: migrações;
- `build.mjs`: geração da pasta `dist/`.
