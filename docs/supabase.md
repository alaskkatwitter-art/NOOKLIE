# Supabase: banco e migrações

Este documento registra o estado observado no projeto Supabase **TORILAND** (ref `fwwgoyburkdybbqmvljk`). O banco já existia; o código SQL original dessas migrações não está versionado neste repositório. A lista abaixo veio do histórico de migrações do projeto conectado.

## Migrações já registradas no banco

| Versão | Nome |
| --- | --- |
| `20261030021627` | `harden_public_schema_access_and_function_security` |
| `20261030024020` | `auth_attempt_rate_limits` |
| `20261030025623` | `complete_auth_recovery_atomically` |

Não reaplique essas alterações manualmente nem use um reset do banco para reconstruir o histórico. Primeiro sincronize o esquema remoto e revise o arquivo gerado.

## Tabelas observadas

Todas as tabelas públicas listadas abaixo estavam com RLS habilitado durante a inspeção.

- **Contas e segurança:** `profiles`, `auth_accounts`, `auth_sessions`, `auth_rate_limits`.
- **Histórias e leitura:** `stories`, `chapters`, `chapter_media`, `chapter_likes`, `scheduled_chapters`, `story_likes`, `reading_progress`, `reading_lists`, `reading_list_items`, `social_stories`.
- **Comunidade e reações:** `follows`, `posts`, `post_likes`, `comments`, `comment_likes`, `polls`, `poll_options`, `poll_votes`, `nook_posts`, `nook_post_media`, `nook_post_reactions`, `nook_comments`, `nook_comment_reactions`, `nook_saved_posts`.
- **Descoberta e clubes:** `tags`, `tag_categories`, `story_tags`, `user_stickers`, `fic_clubs`, `fic_club_members`.

## Sincronizar migrações

Com o Supabase CLI instalado e autenticado:

1. Vincule o projeto remoto: `supabase link --project-ref fwwgoyburkdybbqmvljk`.
2. Confira o histórico local e remoto: `supabase migration list`.
3. Gere uma migração base a partir do esquema remoto existente: `supabase db pull`.
4. Revise cuidadosamente o SQL em `supabase/migrations/` e compare a lista com as três versões já aplicadas.
5. Salve o arquivo gerado no GitHub antes de propor qualquer mudança de esquema.

Para alterações futuras, crie arquivos com `supabase migration new <nome>`, revise o SQL, aplique primeiro em um ambiente de desenvolvimento e só então use `supabase db push` no projeto pretendido. Mantenha RLS e políticas explícitas em todas as tabelas expostas.