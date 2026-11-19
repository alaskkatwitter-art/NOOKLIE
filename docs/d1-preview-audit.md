# Auditoria da prévia D1 do Nooklie

## Validação HTTP remota — 19 de novembro de 2026

A Cloudflare confirmou a versão `9e1830dd-f212-4fce-a043-5a623e77ea65` com 100% do tráfego da prévia isolada. As 20 requisições de verificação passaram: rotas públicas de eventos, Explorar, tags, personagens e jornal; rejeição de acesso anônimo à área administrativa e à descoberta; cadastro e sessão de teste; leitura de temas e alteração de perfil; criação, leitura protegida e exclusão de história; e encerramento de sessão. A história retornou 404 para visitantes enquanto estava em rascunho e após a exclusão. A conta sintética permanece no banco de testes, com a sessão encerrada.

## Tentativa inicial de publicação

- O Wrangler empacotou o commit `63573cc` em modo de simulação com 414 módulos e 226 arquivos estáticos. O pacote comprimido ficou em aproximadamente 2 MiB.
- A tentativa de publicar em `nooklie-preview` parou na autenticação do Wrangler. A API da Cloudflare confirma que a versão permaneceu inicialmente em `6d8b7f95-40a3-4aa4-b94c-e7e909f5ad43`.
- A prévia usa o banco sintético `nooklie-d1-preview-smoke`, o bucket de gravação `nooklie-preview-media` e o bucket histórico `nooklie-media`. Também foi confirmado o cron de um minuto. A versão anterior habilitava `auth`. A nova versão também habilita `news`, `wiki` e `themes`.

## Validação local do runtime

Os 76 testes D1 passaram. O pacote foi executado no runtime local do Worker
com as migrações aplicadas em um banco sintético. As verificações HTTP
passaram para eventos, Explorar, tags, personagens, comentários do jornal,
bloqueio de acesso anônimo à descoberta e à administração, cadastro, login,
sessão, descoberta autenticada, atualização de perfil, temas e criação,
leitura e exclusão de uma história sintética. A exclusão foi confirmada por
uma nova consulta que retornou 404. A verificação HTTP remota está registrada acima.

## Dependências fora das 44 rotas

A revisão estática encontrou 88 arquivos de rotas. 82 usam o seletor D1 diretamente. Dos seis restantes, quatro ainda chamam o Supabase por módulos compartilhados. O seletor funciona por método e por ramo, de modo que essa contagem não comprova cobertura de todos os fluxos.

| Entrada | Dependência restante |
| --- | --- |
| `GET /api/admin/access` | Contexto de equipe, departamentos e permissões em `lib/admin/authorization.ts`. |
| `GET /api/nook-posts/detail` | Sessão via `chatActor` e dados/visibilidade do cartão via `lib/social/posts.ts`. |
| `POST /api/profile/avatar` e `POST /api/profile/cover` | Leitura e gravação dos metadados em `lib/profile/upload-image.ts`, apesar da camada de mídia R2. |
| `GET /api/content-media`, bucket legado `stories` | O ramo segue para a RPC `content_media_allowed`. Os ramos D1 existentes cobrem `chapter-media`, `nook-media`, `story-covers` e `social-stories`. |
| `/equipe` | Equipes, cargos, departamentos, administradores e perfis no Supabase. |
| `/sitemap.xml` | RPC `discovery_sitemap` no Supabase. |
| `/video/[id]` | Localização de vídeo e decisão de visibilidade no Supabase. A rota de vídeo da API tem ramo D1. |
| Metadados de `/historia/[id]` | Título, sinopse e autorização de visualização no Supabase. A API da história tem ramo D1. |

As outras duas rotas sem seletor são mídia pública R2 e Spotify oEmbed. Os módulos compartilhados de sessão, chat, descoberta, administração, moderação, tags e mídia ainda contêm caminhos Supabase. Antes de considerar a origem dispensável, falta percorrer os métodos e fluxos com o Worker publicado, incluindo agendamento, arquivos históricos, mídias privadas, controle de acesso e carga com o catálogo real. O agendamento do candidato tem configuração própria do Worker. O banco com dados reais foi usado apenas na comparação.

## Comparação de dados

As consultas leram as 72 tabelas do Supabase de produção e do D1 `nooklie-migration`. Foram comparadas **14.316 linhas em cada banco**, com **zero divergências nas 72 tabelas**. A checagem de chaves estrangeiras do D1 também retornou zero violações.

Cada campo foi convertido para a representação de comparação, então recebeu um SHA-256. A comparação combinou os campos por registro e comparou a sequência completa de pares de chave e registro, ordenada pela impressão digital da chave primária. Foram incluídas as chaves compostas. A contagem e o resumo criptográfico precisam coincidir para cada tabela, o que detecta linhas presentes em um banco só e campos alterados com contagens iguais. Valores nulos têm representação distinta. Booleanos usam 0 e 1, datas e horas usam UTC com milissegundos, números SQL decimais têm escala normalizada e arrays e JSON são comparados em representação canônica compatível com o PostgreSQL. Os resultados não contêm valores de registros, chaves individuais ou credenciais.

A comparação foi feita sem interromper as gravações e em várias consultas. Ela vale para os registros lidos nessa execução. A comparação final ainda é necessária durante a pausa de gravações para o corte. Esta verificação cobre dados relacionais. O conteúdo binário dos objetos R2 requer validação própria.

| Tabela | Linhas no Supabase | Linhas no D1 | Resultado |
| --- | ---: | ---: | --- |
| `admin_audit_log` | 42 | 42 | Igual |
| `applications` | 2 | 2 | Igual |
| `auth_accounts` | 161 | 161 | Igual |
| `auth_rate_limits` | 726 | 726 | Igual |
| `auth_sessions` | 252 | 252 | Igual |
| `beta_reading_invites` | 0 | 0 | Igual |
| `beta_reading_notes` | 0 | 0 | Igual |
| `chapter_favorites` | 25 | 25 | Igual |
| `chapter_likes` | 90 | 90 | Igual |
| `chapter_media` | 330 | 330 | Igual |
| `chapters` | 190 | 190 | Igual |
| `chat_audit_access` | 6 | 6 | Igual |
| `chat_blocks` | 1 | 1 | Igual |
| `chat_group_invite_links` | 0 | 0 | Igual |
| `chat_group_members` | 6 | 6 | Igual |
| `chat_messages` | 476 | 476 | Igual |
| `chat_reports` | 1 | 1 | Igual |
| `chat_threads` | 24 | 24 | Igual |
| `comment_likes` | 0 | 0 | Igual |
| `comments` | 287 | 287 | Igual |
| `departments` | 8 | 8 | Igual |
| `discovery_preferences` | 54 | 54 | Igual |
| `fic_club_members` | 0 | 0 | Igual |
| `fic_clubs` | 0 | 0 | Igual |
| `follow_requests` | 0 | 0 | Igual |
| `follows` | 644 | 644 | Igual |
| `moderation_reports` | 0 | 0 | Igual |
| `moderation_warnings` | 0 | 0 | Igual |
| `news_comments` | 2 | 2 | Igual |
| `nook_comment_reactions` | 219 | 219 | Igual |
| `nook_comments` | 513 | 513 | Igual |
| `nook_post_media` | 120 | 120 | Igual |
| `nook_post_reactions` | 1332 | 1332 | Igual |
| `nook_posts` | 341 | 341 | Igual |
| `nook_reposts` | 42 | 42 | Igual |
| `nook_saved_posts` | 4 | 4 | Igual |
| `nook_saved_replies` | 1 | 1 | Igual |
| `official_signup_tokens` | 1 | 1 | Igual |
| `opportunities` | 3 | 3 | Igual |
| `permissions` | 16 | 16 | Igual |
| `platform_admins` | 2 | 2 | Igual |
| `poll_options` | 0 | 0 | Igual |
| `poll_votes` | 0 | 0 | Igual |
| `polls` | 0 | 0 | Igual |
| `post_likes` | 0 | 0 | Igual |
| `posts` | 0 | 0 | Igual |
| `profile_mutes` | 0 | 0 | Igual |
| `profile_themes` | 38 | 38 | Igual |
| `profiles` | 161 | 161 | Igual |
| `reader_preferences` | 37 | 37 | Igual |
| `reading_list_items` | 151 | 151 | Igual |
| `reading_lists` | 64 | 64 | Igual |
| `reading_progress` | 197 | 197 | Igual |
| `scheduled_chapters` | 1 | 1 | Igual |
| `social_stories` | 10 | 10 | Igual |
| `stories` | 98 | 98 | Igual |
| `story_daily_engagement` | 442 | 442 | Igual |
| `story_event_entries` | 3 | 3 | Igual |
| `story_events` | 1 | 1 | Igual |
| `story_likes` | 4 | 4 | Igual |
| `story_tags` | 805 | 805 | Igual |
| `support_tickets` | 25 | 25 | Igual |
| `tag_categories` | 7 | 7 | Igual |
| `tags` | 585 | 585 | Igual |
| `team_memberships` | 4 | 4 | Igual |
| `team_role_permissions` | 2 | 2 | Igual |
| `team_roles` | 1 | 1 | Igual |
| `user_notifications` | 5702 | 5702 | Igual |
| `user_stickers` | 50 | 50 | Igual |
| `wiki_character_edits` | 1 | 1 | Igual |
| `wiki_character_favorites` | 5 | 5 | Igual |
| `wiki_characters` | 1 | 1 | Igual |
