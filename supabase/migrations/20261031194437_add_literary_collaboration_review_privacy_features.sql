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
## O serviço
O Nooklie é uma plataforma independente e gratuita para ler e compartilhar histórias originais e fanfictions, incluindo universos alternativos, crossovers e personagens originais. Não há anúncios, assinaturas, venda de obras ou cobrança pelo uso.

## Sua conta
Use nome de usuário e senha. Guarde sua chave de recuperação em local seguro: não exigimos e-mail, telefone, nome civil ou data de nascimento no cadastro. Não compartilhe senha nem chave. Contas múltiplas e pseudônimos são permitidos, mas não podem ser usados para perseguir pessoas, manipular interações ou contornar medidas de moderação.

## Publicação e direitos
Você mantém os direitos sobre suas contribuições e concede uma licença não exclusiva e gratuita, limitada a hospedar, processar e exibir o que publicar nas funções escolhidas. Isso não transfere sua autoria nem autoriza venda ou treinamento de inteligência artificial. Direitos de terceiros continuam protegidos. Leia a Política de Direitos Autorais antes de publicar fanfictions, traduções ou imagens.

## Regras e funcionamento
Escolha a classificação e os avisos adequados. As Diretrizes da Comunidade, a Política de Conteúdo e a Política de Moderação explicam as restrições e os recursos contra decisões. O serviço pode sofrer interrupções; mantenha cópias das suas obras. Não prometemos disponibilidade contínua ou proteção absoluta contra cópia.

## Encerramento e alterações
As configurações oferecem exportação, desativação e solicitação de exclusão. Solicitar exclusão não apaga imediatamente a conta; a análise considera direitos de terceiros e obrigações de preservação. Mudanças materiais nas obrigações, licença, direitos ou medidas de moderação serão destacadas e poderão exigir novo aceite. Correções de redação sem mudança de sentido não exigem novo aceite. Não presumimos concordância pelo silêncio e não aplicamos novas permissões retroativamente.
$policy$, 'draft', true),
('privacy', '0.1.0', 'Política de Privacidade', $policy$
## Responsável e contato
Controlador: [PREENCHER IDENTIFICAÇÃO DO RESPONSÁVEL]. Canal para privacidade e direitos: [PREENCHER CANAL PÚBLICO DE CONTATO]. Esses dados precisam ser informados antes da publicação deste documento. A identificação pública do responsável pelo serviço não exige que os usuários exponham suas identidades.

## Dados e finalidades
O cadastro usa nome de usuário, senha e chave de recuperação, sem exigir e-mail, telefone, nome civil, endereço ou data de nascimento. Processamos perfil, conteúdo publicado, interações, preferências e informações necessárias à autenticação. Senhas, chaves e tokens de sessão são armazenados em formato protegido. O cookie de sessão permite manter o acesso à conta; ele não é autorização para publicidade.

Contas e publicações são tratadas para executar o serviço solicitado. Segurança, prevenção de abuso e análise de denúncias usam informações estritamente necessárias, com avaliação de necessidade e dos direitos das pessoas envolvidas. Obrigações legais e ordens válidas podem exigir preservação ou divulgação específica. Não tratamos o aceite deste documento como consentimento genérico para qualquer finalidade.

## Visibilidade e fornecedores
Publicações e partes do perfil podem ser públicas. Publicação anônima oculta a autoria na apresentação pública da história; não impede a identificação interna necessária à segurança. Não publique dados sensíveis próprios ou de terceiros. O serviço utiliza Supabase para banco e armazenamento, com o projeto na região us-east-2 (Estados Unidos), e Vercel para hospedagem. [PREENCHER LOCALIZAÇÃO E TRANSFERÊNCIAS DA VERCEL E SALVAGUARDAS CONTRATUAIS CONFIRMADAS DOS FORNECEDORES].

## Acesso, conservação e exclusão
A equipe recebe acesso por função, com registros de ações. Moderadores não têm acesso irrestrito a conversas privadas. [PREENCHER PRAZOS E CRITÉRIOS DE RETENÇÃO PARA CONTAS, DENÚNCIAS, REGISTROS TÉCNICOS E BACKUPS]. Não prometemos apagamento imediato de cópias de segurança ou informações cuja preservação seja legalmente exigida. Restrições precisam ser justificadas à pessoa solicitante.

## Seus direitos
Você pode pedir confirmação, acesso, correção, informações de compartilhamento, oposição nos casos cabíveis e exclusão, bloqueio ou anonimização conforme a LGPD. Use o canal acima; não publique documentos pessoais em comentários. Há exportação e solicitação de exclusão nas configurações. Confirmação e acesso simplificado devem receber resposta imediata ou declaração completa em até 15 dias, conforme o caso; os demais pedidos seguem os prazos aplicáveis. Você também pode recorrer à ANPD.

## Crianças e adolescentes
O tratamento deve observar o melhor interesse e as salvaguardas aplicáveis. Não usamos data de nascimento autodeclarada como prova de maioridade. [PREENCHER MEDIDAS EFETIVAMENTE IMPLANTADAS DE AFERIÇÃO ETÁRIA E SUPERVISÃO, ANTES DE AFIRMAR CONFORMIDADE]. Mudanças de finalidade ou coleta exigem informação específica e base legal adequada, não apenas novo aceite desta política.
$policy$, 'draft', false),
('community', '0.1.0', 'Diretrizes da Comunidade', $policy$
## Convivência
Críticas positivas ou negativas às obras são permitidas. Ataques pessoais, humilhação, ameaças, perseguição, assédio sexual, LGBTfobia, racismo, capacitismo e outras formas de discriminação são proibidos. Discordar não autoriza ataques coordenados ou mobilização para perseguir outra pessoa.

## Ficção e contexto
Histórias podem retratar violência e preconceito com contexto narrativo ou crítico e avisos adequados. A ficção não pode ser usada para promover ódio, incitar violência, aliciar pessoas ou divulgar instruções de exploração. Uma denúncia será avaliada considerando contexto e evidências, sem presumir culpa pelo número de denúncias.

## Privacidade
Não divulgue dados pessoais, documentos, localização ou identidade real de alguém sem autorização. Não exponha conversas privadas para constranger ou perseguir. Pseudônimos, contas múltiplas e publicação anônima são permitidos dentro das regras. Não tente descobrir ou divulgar a identidade de autores anônimos.

## Publicações e interações
Evite spam, plágio, personificação enganosa e manipulação de avaliações. Marque spoilers e respeite os avisos de conteúdo. Não ofereça serviços ou materiais ilegais. Imagens, capas, textos e traduções precisam respeitar os direitos de seus titulares.

## Ajuda e proteção
Relatar sofrimento ou pedir ajuda não é motivo, por si só, para punição. Incentivar violência, automutilação, exploração ou abuso é proibido. Não publique imagens íntimas nem material de abuso como evidência pública. Use o botão de denúncia do conteúdo ou perfil e os controles de bloqueio. A equipe pode adotar proteção imediata em situações graves, com registro e possibilidade de revisão quando cabível.
$policy$, 'draft', true),
('content-rating', '0.1.0', 'Política de Conteúdo e Classificação', $policy$
## Classificação e avisos
Cada história deve indicar Livre, 12, 14, 16 ou 18 anos. A classificação escolhida pelo autor é uma orientação do Nooklie, não uma certificação oficial. Considere a intensidade, a frequência e o contexto dos temas. Avise sobre violência, abuso, discriminação, morte, saúde mental e outros assuntos sensíveis. Classificação e avisos não autorizam conteúdo proibido.

## Conteúdo permitido e proibido
Romance adolescente e temas difíceis podem ser tratados de forma contextualizada, respeitando as demais regras. Conteúdo sexual explícito envolvendo pessoas ou personagens menores de 18 anos, ou representações sexualizadas com aparência infantil, é proibido. Alterar somente a idade declarada não torna adulta uma representação infantil. São proibidos exploração sexual, aliciamento, intimidade real divulgada sem autorização, incitação à violência e materiais ilegais.

## Acesso adulto
Classificar uma obra como 18+ não comprova a idade de quem a acessa. Caixa de confirmação, login e data autodeclarada não equivalem, isoladamente, a verificação confiável. [PREENCHER MECANISMO DE AFERIÇÃO E RESTRIÇÃO REALMENTE IMPLANTADO]. Enquanto esse mecanismo não estiver definido e validado, este documento não deve anunciar que o site impede o acesso de menores a obras adultas.

## Correções
A equipe pode solicitar ajustes de classificação ou avisos, informar o motivo e indicar um prazo. O autor pode corrigir e responder à solicitação. O vencimento não remove a história automaticamente: a equipe analisa a resposta e pode restringir ou remover conteúdo que permaneça irregular. Casos graves podem exigir medida imediata. A pessoa afetada pode apresentar recurso pelo fluxo de moderação.
$policy$, 'draft', true),
('copyright', '0.1.0', 'Política de Direitos Autorais', $policy$
## Autoria e licença
Você mantém os direitos sobre suas criações e deve publicar apenas conteúdo que tenha direito de utilizar. A licença ao Nooklie é não exclusiva, gratuita e limitada às operações necessárias ao serviço. Não autoriza venda, transferência da obra ou treinamento de inteligência artificial. Créditos não substituem permissão de uso.

## Fanfiction e traduções
Fanfictions podem usar universos, personagens e elementos de terceiros; os direitos desses titulares permanecem preservados. Gratuidade, aviso de ausência de vínculo e atribuição não tornam automaticamente qualquer uso permitido. Não oferecemos garantia geral de “uso justo” baseada em regras estrangeiras. A licitude depende da legislação, de autorizações e das circunstâncias. Traduções devem ter autorização do titular ou outra base legal aplicável, como domínio público quando efetivamente cabível.

## Capas e imagens
Use imagens próprias, licenciadas ou autorizadas. Informe os créditos exigidos pela licença. As medidas de interface podem dificultar cópias casuais, mas não impedem capturas de tela nem o acesso técnico a imagens já exibidas. Não prometemos impedir downloads de conteúdo público.

## Reclamações
Quem alegar violação deve indicar o conteúdo e seu endereço, a obra original ou a titularidade alegada e uma explicação objetiva. Não divulgue documentos ou dados pessoais na denúncia pública. A equipe poderá solicitar comprovação por canal reservado, limitada ao necessário, e analisar medidas e preservação de evidências. O autor afetado pode apresentar explicação ou autorização e pedir revisão. A retirada de crédito, o pseudônimo ou a exclusão de uma conta não extinguem os direitos dos demais participantes.

## Encaminhamento
Use os botões de denúncia disponíveis na história ou no perfil para iniciar a análise. [PREENCHER CANAL EXTERNO PARA TITULARES SEM CONTA E NOTIFICAÇÕES FORMAIS]. Solicitações e ordens válidas seguem a legislação brasileira aplicável; não usamos automaticamente procedimentos estrangeiros de notificação e contranotificação.
$policy$, 'draft', true),
('collaboration', '0.1.0', 'Política de Colaboração e Coautoria', $policy$
## Convites e créditos
Coautores, designers, revisores, leitores beta e tradutores precisam aceitar o convite antes da exibição do vínculo correspondente. Silêncio não significa aceite. O convite informa a função e suas permissões. Crédito reconhece uma contribuição, mas não transfere direitos nem constitui autorização para usar material de terceiros.

## Edição
Coautores aceitos podem editar nos limites indicados pelo serviço. O histórico registra a pessoa responsável pelas alterações. Nenhum coautor pode transferir ou excluir unilateralmente os direitos dos demais. Combine decisões editoriais, uso de materiais e responsabilidades antes de aceitar. Mantenha cópias das suas contribuições.

## Saída e portfólio
A pessoa colaboradora pode sair voluntariamente da função e retirar a exibição do próprio crédito ou controlar o portfólio. A retirada do vínculo técnico não apaga o histórico de contribuições nem resolve, por si só, controvérsias de autoria. A administração pode analisar abuso ou conflito documentado, preservando os direitos envolvidos.

## Exclusão de obras
A exclusão solicitada por coautor exige aprovação de todos os coautores ativos. O solicitante registra seu voto favorável; os demais recebem a solicitação e decidem. Enquanto houver voto pendente, a obra permanece. Uma recusa encerra o pedido sem exclusão. A unanimidade aprova a exclusão, mantendo o registro da decisão. Medidas de segurança, violação das regras e ordens válidas podem exigir intervenção administrativa distinta desse fluxo.

## Acordos entre participantes
O registro de convite, aceite e edição facilita a gestão do projeto, mas não substitui um acordo específico sobre direitos e uso das contribuições. Alterações materiais nessas permissões exigem comunicação e novo aceite; não serão atribuídas retroativamente por silêncio.
$policy$, 'draft', true),
('moderation', '0.1.0', 'Política de Moderação e Denúncias', $policy$
## Como denunciar
Use o botão de denúncia de uma história, capítulo, comentário, resenha, publicação ou perfil. Explique o problema e forneça somente as evidências necessárias. São aceitos até três links HTTP/HTTPS ou imagens JPG, PNG e WEBP, com até 1 MB por arquivo e 3 MB somados. Não envie senhas, documentos desnecessários, imagens íntimas ou material de exploração sexual como anexo.

## Análise e privacidade
O volume de denúncias não determina culpa. A equipe avalia contexto, gravidade, evidências e risco. Anexos de denúncia são privados e acessíveis apenas por pessoas autorizadas; a identidade do denunciante não é exposta à pessoa denunciada. Os links não são buscados automaticamente pelo servidor. Controles automáticos podem apoiar a segurança, mas não são apresentados como análise humana.

## Medidas
Conforme a gravidade, podem ocorrer orientação, advertência, correção de avisos ou classificação, ocultação de conteúdo, suspensão temporária ou banimento. A progressão não impede proteção imediata em risco grave. Pedidos de ajuda e relatos de sofrimento não são infrações por si só. A decisão deve indicar o motivo e informações suficientes para contestação, resguardando pessoas e evidências.

## Recurso
A pessoa afetada pode pedir revisão na área de recursos da conta, explicar sua discordância e apresentar informações pertinentes. O pedido não garante reversão automática. A equipe registra a decisão, a justificativa e o resultado. A ausência de resposta imediata não significa aceite ou rejeição.

## Equipe e casos graves
Permissões são verificadas no servidor e limitadas à função. Moderadores não veem senhas, não mudam suas próprias permissões e não têm acesso irrestrito a conversas privadas. Ações ficam em auditoria. Exploração de menores, ameaças e outras situações graves exigem protocolo reservado de proteção, remoção quando cabível, preservação proporcional de evidências e comunicação às autoridades nos casos previstos em lei. [PREENCHER CANAL EXTERNO PARA DENÚNCIAS SEM CONTA].
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
