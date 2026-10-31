# NOOKLIE

MVP de uma plataforma para descobrir, ler e publicar histórias.

## Configuração

1. Copie `.env.example` para `.env.local`.
2. Preencha as credenciais do seu projeto Supabase.
3. Instale as dependências com `npm install`.
4. Inicie o ambiente local com `npm run dev`.

A variável `SUPABASE_SECRET_KEY` é privada e deve ficar somente no servidor. Nunca a coloque em uma variável `NEXT_PUBLIC_*` nem publique seu valor no GitHub.

## Comandos

- `npm run dev`: iniciar o servidor local.
- `npm run lint`: verificar o código com ESLint.
- `npm run build`: gerar a versão de produção.
