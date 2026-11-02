# Supabase: banco, segurança e migrações

Projeto conectado: `fwwgoyburkdybbqmvljk` (TORILAND). Esta documentação foi atualizada após uma nova leitura do histórico remoto em 31/10/2026.

## Histórico e reconciliação

O histórico remoto contém **25 migrações aplicadas**. O SQL de cada uma foi lido da tabela `supabase_migrations.schema_migrations` e comparado aos arquivos locais. A comparação encontrou seis versões remotas sem arquivo local e alterações posteriores que haviam sido incorporadas a duas migrações antigas. Os 25 arquivos canônicos agora estão em `supabase/migrations/`, com as versões e o SQL armazenados no banco. As 19 cópias locais anteriores foram preservadas em `supabase/migration_archive/pre-reconciliation/`; **não execute os arquivos do arquivo morto**.

O diretório ativo contém as 25 versões já aplicadas, seguidas pelas três migrações pendentes listadas abaixo. Essa reconciliação muda apenas o controle de versão; **nenhum SQL foi aplicado ao banco ativo**. Uma tentativa de criar uma branch de desenvolvimento confirmou que o projeto está no plano Free, que não oferece branching.

A tentativa de reconstrução histórica no CI falhou na primeira migração: ela revoga permissões de `public.handle_new_user()`, que existe na produção, mas não é criada por nenhum arquivo ativo do histórico. Isso confirma que o banco recebeu um esquema-base fora das migrações versionadas e que a cadeia **não é reproduzível a partir de um banco vazio**.

Para permitir testes sem branch paga nem escrita na produção, o CI agora inicia apenas um PostgreSQL local descartável, carrega `supabase/verification/applied_schema_fixture.sql` e executa as três migrações pendentes e os fluxos SQL/RLS sobre esse estado. O fixture contém DDL observado no schema aplicado em 31/10/2026, sem linhas de produção; é somente um ponto de partida para validar as migrações pendentes, **não** uma migração canônica nem uma solução para a reprodução completa das 25 versões históricas.

Não rode `db push`, `migration repair`, reset ou qualquer reaplicação na produção. A cadeia histórica segue não reproduzível e qualquer migração em produção exige validação completa e autorização explícita.

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

Migrações locais pendentes no branch da implementação (ainda não aplicadas ao Supabase):

- `20261031194437_add_literary_collaboration_review_privacy_features`
- `20261031210000_extend_moderation_reports_and_appeals`
- `20261031220000_collaborator_exit_and_credit_withdrawal`

Elas criam estruturas usadas por avaliações, colaboração, políticas, denúncias de conteúdo literário e recursos; a última adiciona a saída voluntária de colaboradores com retirada atômica do crédito. A primeira também limita a classificação de histórias a Livre, 12, 14, 16 ou 18 anos. Esses fluxos só devem ser ativados depois da validação e aplicação ordenada em um ambiente de desenvolvimento.

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

## Validação concluída em 02/11/2026

O [CI do commit `1249f534`](https://github.com/alaskkatwitter-art/NOOKLIE/actions/runs/41456533905) passou: o snapshot sem dados foi carregado no banco descartável, as três migrações pendentes foram executadas e todas as nove verificações SQL passaram, incluindo RLS, administração, moderação, recursos e consenso para exclusão de histórias. Lint, build e os 15 testes da aplicação também passaram; o lint ainda emite avisos preexistentes.

A falha final era a inicialização dos votos de exclusão: outros coautores recebiam `false`, mas a função de decisão aceita apenas votos ainda `NULL`. Agora somente o solicitante começa com aprovação; os demais ficam sem decisão e sem data de voto. A regressão verifica esses estados, a preservação da obra antes do consenso, a exclusão após unanimidade e a preservação da obra em caso de recusa. A migração corrigida continua pendente na produção.

## Próximos passos

1. Concluir os testes visuais e funcionais em celular e computador.
2. Tratar a reconstrução histórica completa como trabalho separado: o fixture representa o estado atual aplicado, não prova a reprodução das 25 migrações desde uma instalação vazia.
3. Manter a produção sem alterações até existir autorização explícita para aplicar as migrações e publicar.

## Descoberta e recursos em implementação

As categorias e filtros de tags já vivem no catálogo do Supabase. O assessor de segurança consultado em 31/10/2026 retornou zero avisos; o assessor de desempenho listou 64 índices sem uso observado, que não devem ser removidos sem medir consultas reais. Sugestões de tag podem ser publicadas imediatamente, com normalização de slug e limite de criação. Avaliações, favoritos, bloqueios, privacidade, coautoria, créditos, histórico, recursos e denúncias de conteúdo literário estão em migrações aditivas pendentes. As verificações estão em `supabase/verification/literary_features.sql` e `supabase/verification/moderation_appeal_workflow.sql`.

