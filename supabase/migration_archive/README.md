# Arquivo de migrações anteriores à reconciliação

Os arquivos em `pre-reconciliation/` preservam as 19 versões que estavam no diretório ativo antes da comparação com o histórico remoto em 31/10/2026.

Eles foram movidos para cá, não apagados. Algumas versões locais haviam incorporado correções que no banco constam como migrações separadas. A sequência canônica está em `supabase/migrations/` e corresponde ao SQL e às versões registrados em `supabase_migrations.schema_migrations`.

Este diretório é somente histórico e não deve ser executado pelo Supabase CLI.
