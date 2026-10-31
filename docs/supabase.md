# Supabase: banco, segurança e migrações

Projeto conectado: `fwwgoyburkdybbqmvljk` (TORILAND). Esta documentação foi atualizada após uma nova leitura do histórico remoto em 31/10/2026.

## Situação que exige reconciliação

O histórico remoto contém **25 migrações aplicadas**. O repositório contém **21 arquivos de migração**; somente três têm a mesma versão e o mesmo nome do histórico remoto. Os outros nomes e versões podem representar alterações equivalentes com timestamps diferentes, mas isso ainda não foi comparado por SQL.

**Não rode `supabase db push`, `migration repair`, reset ou qualquer reaplicação em produção até concluir essa comparação.** Uma cópia de desenvolvimento do banco não pôde ser criada porque o plano conectado não permite branching. As migrações literárias e de recursos de moderação abaixo seguem pendentes; nenhuma foi aplicada ao banco ativo.

### Histórico remoto observado

| Versão | Nome |
| --- | --- |
| `20261030021627` | `harden_public_schema_access_and_function_security` |
| `20261030024020` | `auth_attempt_rate_limits` |
| `20261030025623` | `complete_auth_recovery_atomically` |
| `20261031012246` | `secure_public_access_and_optimize_rls` |
| `20261031013628` | `add_tag_aware_story_discovery` |
| `20261031014115` | `exclude_unpublished_stories_before_paging` |
| `20261031015325` | `add_official_account_auto_follow` |
| `20261031174358` | `admin_foundation_rbac` |
| `20261031174855` | `admin_management_operations` |
| `20261031175148` | `admin_operations_role_permission_validation_fix` |
| `20261031175926` | `admin_opportunities_and_applications` |
| `20261031180005` | `admin_applications_prevent_self_appointment` |
| `20261031181002` | `admin_archived_roles_revoke_access` |
| `20261031181140` | `admin_active_role_permission_scope` |
| `20261031181704` | `moderation_reports_and_review` |
| `20261031183008` | `admin_user_account_status` |
| `20261031183656` | `moderation_content_visibility_actions` |
| `20261031184442` | `guard_moderation_visibility` |
| `20261031184537` | `allow_trusted_moderation_visibility_actors` |
| `20261031184710` | `restore_content_from_resolved_reports` |
| `20261031185255` | `admin_rls_and_fk_indexes` |
| `20261031185934` | `seed_platform_admin_ids` |
| `20261031190044` | `enforce_opportunity_openings` |
| `20261031190107` | `serialize_application_reviews` |
| `20261031190603` | `profile_theme_persistence` |

Migrações pendentes no branch da implementação:

- `20261031194437_add_literary_collaboration_review_privacy_features`
- `20261031210000_extend_moderation_reports_and_appeals`

Elas criam estruturas usadas por avaliações, colaboração, políticas, denúncias de conteúdo literário e recursos. Esses fluxos só devem ser ativados depois da validação e aplicação ordenada em um ambiente de desenvolvimento.

## Segurança observada

- Todas as tabelas listadas do schema `public` estavam com RLS habilitado.
- `anon` e `authenticated` não tinham privilégio direto de `SELECT` nas tabelas consultadas. Isso complementa RLS; não substitui as verificações das rotas do Next.js, que usam a chave privada do servidor e passam por RLS.
- Algumas políticas de leitura para `public` usam `USING (true)`. Sem concessão de privilégio de tabela, elas não permitem leitura direta pela Data API. Como a chave privada ignora RLS, cada rota pública ainda precisa filtrar conteúdo não publicado, oculto, desativado e dados privados.
- O assessor de segurança retornou zero avisos. O assessor de desempenho mostrou 64 índices ainda não observados em uso; como o banco tem pouco tráfego/dados, não remover sem medir consultas reais.

## Estruturas observadas

- **Contas:** `profiles`, `auth_accounts`, `auth_sessions`, `auth_rate_limits`, `official_signup_tokens`.
- **Histórias e leitura:** `stories`, `chapters`, `chapter_media`, `chapter_likes`, `scheduled_chapters`, `story_likes`, `reading_progress`, `reading_lists`, `reading_list_items`, `social_stories`.
- **Comunidade:** `follows`, `posts`, `post_likes`, `comments`, `comment_likes`, `polls`, `poll_options`, `poll_votes`, `nook_posts`, `nook_post_media`, `nook_post_reactions`, `nook_comments`, `nook_comment_reactions`, `nook_saved_posts`.
- **Descoberta:** `tags`, `tag_categories`, `story_tags`, `user_stickers`, `fic_clubs`, `fic_club_members`.
- **Administração/moderação:** `platform_admins`, `permissions`, `departments`, `team_roles`, `team_role_permissions`, `team_memberships`, `admin_audit_log`, `user_notifications`, `opportunities`, `applications`, `moderation_reports`.

## Sincronização segura futura

1. Obter uma cópia/exportação do schema remoto ou sincronizar com Supabase CLI autenticado.
2. Comparar cada versão aplicada com o conteúdo dos arquivos locais; documentar equivalências e diferenças sem alterar a tabela de histórico.
3. Gerar uma linha de base revisada para controle de versão e validar que o próximo `migration list` não mostra migrações antigas como pendentes.
4. Aplicar novas migrações em desenvolvimento primeiro. Produção permanece sem alterações até revisão e autorização explícita.

## Descoberta e recursos em implementação

As categorias e filtros de tags já vivem no catálogo do Supabase. Sugestões de tag podem ser publicadas imediatamente, com normalização de slug e limite de criação. Avaliações, favoritos, bloqueios, privacidade, coautoria, créditos, histórico, recursos e denúncias de conteúdo literário estão em migrações aditivas pendentes. As verificações estão em `supabase/verification/literary_features.sql` e `supabase/verification/moderation_appeal_workflow.sql`.

