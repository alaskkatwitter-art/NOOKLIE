# NOOKLIE

MVP de uma plataforma para descobrir, ler e publicar histórias.

## Configuração

1. Copie `.env.example` para `.env.local`.
2. Preencha as credenciais do seu projeto Supabase.
3. Instale as versões registradas no lockfile com `npm ci`.
4. Inicie o ambiente local com `npm run dev`.

A variável `SUPABASE_SECRET_KEY` é privada e deve ficar somente no servidor. Nunca a coloque em uma variável `NEXT_PUBLIC_*` nem publique seu valor no GitHub.

## Comandos

- `npm run dev`: iniciar o servidor local.
- `npm run lint`: verificar o código com ESLint.
- `npm test`: executar os testes de integração HTTP (após `npm run build`).
- `npm run build`: gerar a versão de produção.

O GitHub Actions executa lint, build e testes em cada push e pull request. No primeiro fluxo, ele fixa as versões diretas, gera `package-lock.json` e salva esses dois arquivos no repositório depois que todas as verificações passam.

## Supabase

O estado atual do banco e o histórico das migrações aplicadas estão em [docs/supabase.md](docs/supabase.md).