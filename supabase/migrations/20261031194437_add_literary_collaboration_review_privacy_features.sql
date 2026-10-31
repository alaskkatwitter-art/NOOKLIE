-- Additive schema for literary collaboration, reviews, account privacy, and versioned policies.
-- Existing stories and user data are preserved. New tables are server-managed through the
-- authenticated Next.js API; browser roles receive no direct table privileges.

alter table public.stories
  add column if not exists is_anonymous boolean not null default false,
  add column if not exists anonymity_changed_at timestamptz,
  add column if not exists hidden_by_deactivation boolean not null default false;

alter table public.stories
  add constraint stories_rating_allowed_check
  check (rating is null or rating in ('Livre', '12', '14', '16', '18'));

alter table public.profiles
  add column if not exists designer_portfolio_enabled boolean not null default true,
  add column if not exists available_for_design_requests boolean not null default false,
  add column if not exists deactivated_at timestamptz;

create table if not exists public.story_reviews (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text check (body is null or char_length(body) <= 10000),
  contains_spoilers boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (story_id, reviewer_id)
);

create table if not exists public.review_likes (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.story_reviews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (review_id, user_id)
);

create table if not exists public.review_comments (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.story_reviews(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  parent_comment_id uuid references public.review_comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  contains_spoilers boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chapter_favorites (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (chapter_id, user_id)
);

create table if not exists public.user_blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (blocker_id <> blocked_id),
  unique (blocker_id, blocked_id)
);

create table if not exists public.story_collaborators (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('coauthor', 'designer', 'reviewer', 'beta_reader', 'translator')),
  status text not null default 'active' check (status in ('active', 'left', 'removed')),
  invited_by uuid not null references public.profiles(id),
  accepted_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (story_id, profile_id, role)
);

create table if not exists public.collaborator_invites (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id),
  invitee_id uuid not null references public.profiles(id),
  role text not null check (role in ('coauthor', 'designer', 'reviewer', 'beta_reader', 'translator')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  agreement_acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (inviter_id <> invitee_id)
);

create unique index if not exists collaborator_invites_one_pending_role
  on public.collaborator_invites(story_id, invitee_id, role) where status = 'pending';

create table if not exists public.story_credits (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  contributor_id uuid not null references public.profiles(id),
  requested_by uuid not null references public.profiles(id),
  role text not null check (role in ('designer', 'reviewer', 'beta_reader', 'translator')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  portfolio_visible boolean not null default true,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (story_id, contributor_id, role)
);

create table if not exists public.story_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  requested_by uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create unique index if not exists story_deletion_one_pending_request
  on public.story_deletion_requests(story_id) where status = 'pending';

create table if not exists public.story_deletion_votes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.story_deletion_requests(id) on delete cascade,
  coauthor_id uuid not null references public.profiles(id),
  approved boolean not null,
  decided_at timestamptz not null default now(),
  unique (request_id, coauthor_id)
);

create table if not exists public.story_edit_history (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  entity_type text not null check (entity_type in ('story', 'chapter')),
  entity_id uuid not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.policy_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  version text not null,
  title text not null,
  content_md text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  requires_reacceptance boolean not null default false,
  published_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (slug, version)
);

create table if not exists public.policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  policy_document_id uuid not null references public.policy_documents(id),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  accepted_at timestamptz not null default now(),
  unique (policy_document_id, profile_id)
);

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  target_profile_id uuid references public.profiles(id),
  report_id uuid references public.moderation_reports(id),
  moderator_id uuid not null references public.profiles(id),
  action_type text not null check (action_type in ('warning', 'temporary_suspension', 'long_suspension', 'ban', 'appeal_overturned', 'appeal_rejected', 'content_notice')),
  reason text not null check (char_length(reason) between 1 and 5000),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  appeal_status text not null default 'not_requested' check (appeal_status in ('not_requested', 'pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.account_lifecycle_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  request_type text not null check (request_type in ('export', 'deactivation', 'reactivation', 'deletion')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'cancelled', 'rejected')),
  options jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.story_anonymity_events (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  is_anonymous boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists story_reviews_story_created_idx on public.story_reviews(story_id, created_at desc);
create index if not exists story_reviews_reviewer_idx on public.story_reviews(reviewer_id);
create index if not exists review_likes_review_idx on public.review_likes(review_id);
create index if not exists review_likes_user_idx on public.review_likes(user_id);
create index if not exists review_comments_review_created_idx on public.review_comments(review_id, created_at);
create index if not exists review_comments_user_idx on public.review_comments(user_id);
create index if not exists chapter_favorites_user_created_idx on public.chapter_favorites(user_id, created_at desc);
create index if not exists chapter_favorites_chapter_idx on public.chapter_favorites(chapter_id);
create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked_id);
create index if not exists story_collaborators_profile_status_idx on public.story_collaborators(profile_id, status);
create index if not exists story_collaborators_story_status_idx on public.story_collaborators(story_id, status);
create index if not exists collaborator_invites_invitee_status_idx on public.collaborator_invites(invitee_id, status, created_at desc);
create index if not exists story_credits_contributor_status_idx on public.story_credits(contributor_id, status);
create index if not exists story_deletion_votes_coauthor_idx on public.story_deletion_votes(coauthor_id);
create index if not exists story_edit_history_story_created_idx on public.story_edit_history(story_id, created_at desc);
create index if not exists policy_documents_published_idx on public.policy_documents(slug, published_at desc) where status = 'published';
create index if not exists policy_acceptances_profile_idx on public.policy_acceptances(profile_id, accepted_at desc);
create index if not exists moderation_actions_target_created_idx on public.moderation_actions(target_profile_id, created_at desc);
create index if not exists moderation_actions_moderator_created_idx on public.moderation_actions(moderator_id, created_at desc);
create index if not exists account_lifecycle_profile_status_idx on public.account_lifecycle_requests(profile_id, status, created_at desc);
create index if not exists story_anonymity_story_created_idx on public.story_anonymity_events(story_id, created_at desc);

create or replace function public.get_story_review_summary(p_story_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'average', round(avg(rating)::numeric, 2),
    'total', count(*),
    'distribution', jsonb_build_array(
      jsonb_build_object('rating', 1, 'count', count(*) filter (where rating = 1)),
      jsonb_build_object('rating', 2, 'count', count(*) filter (where rating = 2)),
      jsonb_build_object('rating', 3, 'count', count(*) filter (where rating = 3)),
      jsonb_build_object('rating', 4, 'count', count(*) filter (where rating = 4)),
      jsonb_build_object('rating', 5, 'count', count(*) filter (where rating = 5))
    )
  )
  from public.story_reviews as review
  join public.profiles as reviewer on reviewer.id = review.reviewer_id
  where review.story_id = p_story_id
    and reviewer.deactivated_at is null
    and reviewer.moderation_hidden_at is null;
$$;
revoke all on function public.get_story_review_summary(uuid) from public, anon, authenticated;
grant execute on function public.get_story_review_summary(uuid) to service_role;

insert into public.permissions (code, name, description, scope)
values ('policies.manage', 'Gerenciar políticas', 'Criar versões, publicar e arquivar documentos institucionais.', 'platform')
on conflict (code) do nothing;

-- Seed editable drafts only. They are not publicly visible until reviewed and published by an administrator.
insert into public.policy_documents (slug, version, title, content_md, status, requires_reacceptance)
values
('terms', '0.1.0', 'Termos de Uso', $policy$
> MINUTA EM REVISÃO — não publicar antes de revisão jurídica e aprovação administrativa.

## O que é o Nooklie
Plataforma independente, gratuita e não comercial para leitura, criação e compartilhamento de histórias. O projeto não oferece anúncios, assinaturas, planos pagos nem venda de histórias.

## Conteúdo e autoria
Quem publica mantém a autoria e os direitos sobre as próprias contribuições. A publicação concede ao Nooklie apenas a permissão técnica necessária para hospedar, armazenar, processar e exibir o conteúdo nos recursos escolhidos pela pessoa. O Nooklie não reivindica coautoria, propriedade ou uso para treinamento de IA sem autorização específica.

## Responsabilidade e convivência
Autores escolhem classificações e avisos de conteúdo e devem respeitar as regras da comunidade. Críticas a obras são permitidas; ataques, assédio, exposição de dados pessoais e conteúdo vedado pelas regras serão analisados pela moderação.

## Revisão necessária
Confirmar identidade e contato do controlador, regras para menores, limitações do serviço, retenção, encerramento da conta, notificações legais e procedimentos de contestação. Esta minuta não é aconselhamento jurídico.
$policy$, 'draft', true),
('privacy', '0.1.0', 'Política de Privacidade', $policy$
> MINUTA EM REVISÃO — completar com o responsável pelo tratamento e revisar juridicamente antes de publicar.

## Dados usados no serviço
O cadastro deve continuar usando nome de usuário e senha, sem exigir e-mail, nome civil, telefone, endereço ou data de nascimento. A plataforma processa dados de conta e sessão, perfil, histórias, comentários, interações, preferências e registros de segurança necessários ao serviço.

## Segurança e acesso
Senhas não devem ser retornadas ao navegador; sessões usam tokens armazenados como hash no banco. Acesso a dados privados passa por rotas autenticadas e controles de acesso no Supabase.

## Controles da pessoa
O site oferece exportação dos dados, desativação temporária e solicitação de exclusão. A conclusão da exclusão pode exigir análise de coautoria, segurança e retenção legítima; informar prazos, dados removidos e dados eventualmente retidos antes de publicar.

## Revisão necessária
Definir controlador, finalidade e base legal por atividade, prazos, operadores, transferências, canal para direitos, resposta a incidentes e tratamento de dados de crianças/adolescentes. Não coletar nem usar idade autodeclarada como prova de maioridade.
$policy$, 'draft', true),
('community', '0.1.0', 'Diretrizes da Comunidade', $policy$
> MINUTA EM REVISÃO — publicar após revisão de segurança e moderação.

## Crítica e respeito
Críticas literárias positivas ou negativas são permitidas. Ataques pessoais, humilhação, perseguição, intimidação e ataques coordenados não são.

## Ficção e discriminação
Obras podem retratar preconceito com contexto narrativo ou crítico; não podem usar a ficção para promover ódio, desumanizar grupos protegidos ou incitar violência.

## Segurança e privacidade
Não divulgue dados pessoais sem autorização, não tente descobrir a identidade real de escritores e não exponha conversas privadas para perseguir alguém. Denuncie ameaças, doxxing e exploração de pessoas vulneráveis.

## Conteúdo e avisos
Use a classificação e os avisos adequados. Temas sensíveis podem ser tratados ficcionalmente com avisos claros; conteúdo sexual explícito envolvendo menores de 18 anos é proibido no serviço.
$policy$, 'draft', true),
('content-rating', '0.1.0', 'Política de Conteúdo e Classificação', $policy$
> MINUTA EM REVISÃO — não habilitar acesso a conteúdo 18+ até revisão jurídica e definição de verificação adequada.

## Classificações previstas
Livre, 12, 14, 16 e 18 anos. O autor seleciona a classificação e informa avisos de conteúdo; estes dados devem aparecer na obra, na descoberta e na leitura.

## Conteúdo envolvendo menores
Romance adolescente e temas narrativos podem ser permitidos dentro das regras. Conteúdo sexual explícito envolvendo pessoas ou personagens apresentados como menores de 18 anos não é permitido. Alterar apenas a idade no texto não transforma uma representação infantil ou adolescente em adulta.

## Acesso 18+
A classificação 18+ deve ser identificada e restringida conforme mecanismo juridicamente validado. Uma caixa de confirmação ou idade autodeclarada, isoladamente, não será apresentada como verificação de maioridade. O mecanismo de acesso permanece pendente de revisão jurídica e técnica.

## Referências para revisão profissional
Estatuto da Criança e do Adolescente e Lei nº 15.211/2025 (proteção em ambientes digitais). Avaliar também regulamentos e orientações vigentes antes da publicação.
$policy$, 'draft', true),
('copyright', '0.1.0', 'Política de Direitos Autorais', $policy$
> MINUTA EM REVISÃO — obter revisão jurídica antes de publicar procedimentos de notificação ou remoção.

## Obras e fanfiction
Autores mantêm os direitos sobre obras originais e contribuições criativas próprias. Publicar não transfere a titularidade ao Nooklie. Fanfiction não concede ao escritor direitos sobre personagens ou universos de terceiros. Traduções devem ter autorização ou outra base legal aplicável.

## Uso pela plataforma
O uso de conteúdo pelo Nooklie fica limitado ao necessário para hospedar, armazenar, processar, exibir e operar as funções escolhidas. Não vender histórias nem usá-las para treinar IA sem autorização específica.

## Créditos e coautoria
Créditos de designers e colaboradores só aparecem após aceitação explícita. Crédito não transfere direitos. Coautoria registra permissões de edição e histórico, mas não substitui acordo entre participantes.

## Referências para revisão profissional
Lei nº 9.610/1998 e regras aplicáveis a conteúdo de terceiros, fanfiction, traduções, notificações e contranotificações.
$policy$, 'draft', true),
('collaboration', '0.1.0', 'Política de Colaboração e Coautoria', $policy$
> MINUTA EM REVISÃO — revisar fluxos de consentimento, direitos e conflitos antes da publicação.

## Créditos
Convites para designer, revisor, beta reader ou tradutor exigem aceite do convidado. Silêncio não significa autorização. A pessoa creditada pode retirar o aceite e controlar a exibição do portfólio.

## Coautoria
Coautores aceitos têm permissões técnicas definidas no produto, e cada alteração registra o responsável. Nenhum coautor pode remover unilateralmente os demais ou transferir seus direitos.

## Exclusão de história em coautoria
Solicitações de exclusão exigem a aprovação de todos os coautores ativos; recusas mantêm a obra publicada. A administração poderá intervir diante de segurança, violação ou ordem válida, após análise e registro.

## Acordos
Antes de aceitar, cada pessoa confirma leitura de aviso sobre responsabilidades, direitos, créditos e decisões editoriais. O registro do Nooklie não substitui contratos ou aconselhamento jurídico.
$policy$, 'draft', true),
('moderation', '0.1.0', 'Política de Moderação e Denúncias', $policy$
> MINUTA EM REVISÃO — validar prazos, notificações, recursos e procedimentos de emergência.

## Denúncias e análise
Denúncias podem tratar de histórias, capítulos, comentários, resenhas, publicações e perfis. O número de denúncias não determina culpa. A equipe faz análise humana, registra evidências necessárias e protege a identidade do denunciante.

## Medidas e recurso
Medidas previstas: advertência, suspensão temporária, suspensão mais longa e banimento. Casos graves podem exigir ação imediata. A pessoa afetada recebe informações suficientes e pode pedir revisão, respeitando a segurança das pessoas envolvidas.

## Acesso da equipe
Permissões são vinculadas a identidades internas e verificadas no servidor. Moderadores acessam somente os dados necessários à função, não veem senhas e não alteram as próprias permissões. Ações ficam em histórico de auditoria.

## Referências para revisão profissional
Definir protocolo para ameaças, exposição de dados, segurança de crianças/adolescentes, preservação de evidências, retenção, recurso e atendimento a requisições válidas.
$policy$, 'draft', true)
on conflict (slug, version) do nothing;

-- All new data is server mediated. RLS remains enabled as defense in depth.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'story_reviews', 'review_likes', 'review_comments', 'chapter_favorites', 'user_blocks',
    'story_collaborators', 'collaborator_invites', 'story_credits', 'story_deletion_requests',
    'story_deletion_votes', 'story_edit_history', 'policy_documents', 'policy_acceptances',
    'moderation_actions', 'account_lifecycle_requests', 'story_anonymity_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant all on table public.%I to service_role', table_name);
    execute format('create policy deny_direct_client_access on public.%I for all to anon, authenticated using (false) with check (false)', table_name);
  end loop;
end;
$$;

-- Protect important append-only records even from ordinary staff-role operations.
revoke update, delete, truncate on public.story_edit_history from anon, authenticated, service_role;
revoke update, delete, truncate on public.story_anonymity_events from anon, authenticated, service_role;
revoke update, delete, truncate on public.moderation_actions from anon, authenticated, service_role;
grant select, insert on public.story_edit_history to service_role;
grant select, insert on public.story_anonymity_events to service_role;
grant select, insert on public.moderation_actions to service_role;
