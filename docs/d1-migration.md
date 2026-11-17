# Migração D1: primeira fase

Estado em 17/11/2026: banco `nooklie-migration` criado na conta Cloudflare do
Nooklie, UUID `fcea4d88-3c18-4c21-a6c1-af13c72caa00`, região ENAM.
É um destino isolado para migração, sem dados de usuários e sem troca de produção.
O projeto Supabase de produção continua sendo `fwwgoyburkdybbqmvljk`.

## Implementado e aplicado

`d1/migrations/0001_auth_foundation.sql` cria as três tabelas iniciais:
`auth_accounts`, `auth_sessions`, `auth_rate_limits`. UUIDs e hashes continuam
como texto, sem gerar novos IDs ou recalcular hashes existentes. Datas novas
usam UTC ISO 8601; datas do PostgreSQL devem ser normalizadas para ISO 8601 na
futura importação (SQLite não entende todos os formatos de fuso do PostgreSQL).
Há chave estrangeira de sessão para conta e índices por conta e expiração.

`lib/database/d1-auth.ts` implementa consultas parametrizadas para localizar a
conta, verificar sessão ativa e não expirada, criar/revogar sessão, consumir
limite de tentativas e recuperar a conta. A comparação de senha/chave com bcrypt
continua sendo responsabilidade do servidor antes dessas operações internas.
Não existe endpoint público que permita executar SQL ou passar um user_id como
prova de identidade.

O limite usa um único UPSERT, evitando uma janela de concorrência entre leitura
e incremento. A recuperação compara o hash esperado e troca a chave uma única
vez; um trigger revoga as sessões na mesma operação. A confirmação usa
`UPDATE ... RETURNING`, pois `meta.changes` do D1 pode contar alterações dos
triggers. Suspender a conta também revoga as sessões e impede novas sessões.

`cloudflare/database-binding.ts` e o alias Vite preparam o acesso pelo binding
`NOOKLIE_DB`. O helper de deploy só o anexa quando
`NOOKLIE_D1_MIGRATION=1`, e rejeita essa opção em produção. Nenhuma rota existente
foi trocada para o novo repositório: não misturar sessões D1 com o banco Supabase
enquanto contas, perfis e autorização não tiverem sido migrados em conjunto.

## Validação

- Quatro testes de integração SQLite executam o SQL e o repositório reais,
  cobrindo expiração, suspensão, injeção SQL, recuperação de uso único,
  revogação isolada por conta, rollback de falha no trigger e limites de tentativas.
- Dez verificações no D1 remoto executaram os mesmos métodos do repositório:
  sessão válida, injeção rejeitada, limite permitido/bloqueado, chave incorreta,
  recuperação válida, revogação, chave reutilizada rejeitada, suspensão e criação
  de sessão suspensa rejeitada. Os registros sintéticos foram removidos.
- `npx tsc --noEmit` passou.
- `npm run build:cloudflare-preview` concluiu com sucesso.
- A suíte geral ainda apresenta falhas em testes antigos de mídia, cujos mocks
  não reconhecem `@/lib/media/storage`. As 11 falhas nos testes de fotos de
  grupos/capas também foram reproduzidas no commit de origem `102acd8`, sem
  as mudanças D1. Elas não representam validação concluída do restante do site.

## Próximas fases e condições para troca

O inventário `d1/source-inventory.json` registra as 72 tabelas e 86 assinaturas
de funções encontradas no banco de origem. Três tabelas estão adaptadas nesta
fase; duas funções têm equivalentes no repositório D1. As demais continuam
pendentes. Não copiar SQL PostgreSQL diretamente para o D1 (SQLite).

1. Adaptar perfis, bloqueios, seguidores, cargos e verificações de permissão.
   D1 não reproduz as políticas RLS da Supabase: cada operação de servidor deve
   validar a sessão, o proprietário e as permissões explicitamente. Um selo
   visual nunca pode conceder privilégio administrativo.
2. Adaptar histórias, capítulos, listas, progresso, votos e comentários;
   preservar chaves, relações, regras de publicação e operações atômicas.
3. Adaptar feed, eventos, notificações, moderação e chat; conservar os textos
   cifrados e a chave `CHAT_ENCRYPTION_KEY_V2`, sem expô-la ou recriá-la.
4. Adaptar autorização de mídias R2 e eliminar dependências/fallbacks de Storage
   somente após validar permissões para conteúdos públicos e privados.
5. Substituir o cron PostgreSQL de publicação por uma tarefa no Cloudflare,
   garantindo que uma publicação não gere notificações duplicadas.
6. Fazer exportação consistente e importação normalizada, comparar contagens,
   relações e integridade; testar login, recuperação, leitura, edição, upload,
   chat e administração em ambiente isolado. Repetir sincronização final com
   gravações controladas antes da virada para evitar perda de alterações recentes.
7. Trocar o banco somente quando os fluxos estiverem prontos e verificados;
   manter backup e caminho de recuperação antes de excluir a origem.

Nenhum usuário real foi importado, nenhuma chave foi alterada, nenhum dado da
Supabase foi excluído e o site publicado não foi modificado nesta fase.
