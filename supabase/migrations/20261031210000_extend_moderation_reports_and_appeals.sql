-- Extend the existing human moderation workflow to literary content and appeals.
-- This migration is additive; do not apply until the repository/remote history is reconciled.

alter table public.chapters add column if not exists moderation_hidden_at timestamptz;
alter table public.comments add column if not exists moderation_hidden_at timestamptz;
alter table public.story_reviews add column if not exists moderation_hidden_at timestamptz;
alter table public.review_comments add column if not exists moderation_hidden_at timestamptz;
grant update (appeal_status, ends_at) on public.moderation_actions to service_role;

alter table public.moderation_reports drop constraint if exists moderation_reports_content_type_check;
alter table public.moderation_reports add constraint moderation_reports_content_type_check
  check (content_type in ('profile', 'post', 'story', 'chapter', 'comment', 'review', 'review_comment'));
alter table public.moderation_reports
  add column if not exists evidence_urls text[] not null default '{}'::text[];
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'moderation_reports_evidence_urls_check') then
    alter table public.moderation_reports add constraint moderation_reports_evidence_urls_check
      check (cardinality(evidence_urls) <= 3 and array_position(evidence_urls, null) is null);
  end if;
end;
$$;

create index if not exists chapters_public_story_idx
  on public.chapters (story_id, chapter_number) where moderation_hidden_at is null;
create index if not exists comments_chapter_created_visible_idx
  on public.comments (chapter_id, created_at) where moderation_hidden_at is null;
create index if not exists story_reviews_story_visible_idx
  on public.story_reviews (story_id, created_at desc) where moderation_hidden_at is null;
create index if not exists review_comments_review_visible_idx
  on public.review_comments (review_id, created_at) where moderation_hidden_at is null;

create or replace function public.get_story_review_summary(p_story_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'average', round(avg(review.rating)::numeric, 2),
    'total', count(*),
    'distribution', jsonb_build_array(
      jsonb_build_object('rating', 1, 'count', count(*) filter (where review.rating = 1)),
      jsonb_build_object('rating', 2, 'count', count(*) filter (where review.rating = 2)),
      jsonb_build_object('rating', 3, 'count', count(*) filter (where review.rating = 3)),
      jsonb_build_object('rating', 4, 'count', count(*) filter (where review.rating = 4)),
      jsonb_build_object('rating', 5, 'count', count(*) filter (where review.rating = 5))
    )
  )
  from public.story_reviews as review
  join public.profiles as reviewer on reviewer.id = review.reviewer_id
  where review.story_id = p_story_id
    and review.moderation_hidden_at is null
    and reviewer.deactivated_at is null
    and reviewer.moderation_hidden_at is null;
$$;
revoke all on function public.get_story_review_summary(uuid) from public, anon, authenticated;
grant execute on function public.get_story_review_summary(uuid) to service_role;

drop function if exists public.submit_moderation_report(text, text, uuid, text, text);
create function public.submit_moderation_report(
  p_session_token_hash text,
  p_content_type text,
  p_content_id uuid,
  p_reason text,
  p_details text default '',
  p_evidence_urls text[] default '{}'::text[]
)
returns uuid
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_actor uuid;
  v_target uuid;
  v_department uuid;
  v_report_id uuid;
  v_evidence_url text;
begin
  v_actor := public.admin_current_actor(p_session_token_hash);
  if p_content_type = 'profile' then
    select profile.user_id into v_target from public.profiles as profile where profile.id = p_content_id;
  elsif p_content_type = 'post' then
    select post.user_id into v_target from public.nook_posts as post where post.id = p_content_id;
  elsif p_content_type = 'story' then
    select story.author_id into v_target from public.stories as story where story.id = p_content_id;
  elsif p_content_type = 'chapter' then
    select story.author_id into v_target from public.chapters as chapter join public.stories as story on story.id = chapter.story_id where chapter.id = p_content_id;
  elsif p_content_type = 'comment' then
    select comment.user_id into v_target from public.comments as comment where comment.id = p_content_id;
  elsif p_content_type = 'review' then
    select review.reviewer_id into v_target from public.story_reviews as review where review.id = p_content_id;
  elsif p_content_type = 'review_comment' then
    select comment.user_id into v_target from public.review_comments as comment where comment.id = p_content_id;
  else
    raise exception using errcode = '22023', message = 'Unsupported moderation target';
  end if;

  if v_target is null then raise exception using errcode = 'P0002', message = 'Reported content not found'; end if;
  if v_target = v_actor then raise exception using errcode = '22023', message = 'You cannot report your own content'; end if;
  if p_reason not in ('harassment', 'spam', 'inappropriate', 'copyright', 'safety', 'other')
     or char_length(btrim(coalesce(p_details, ''))) > 3000 then
    raise exception using errcode = '22023', message = 'Report details are invalid';
  end if;
  if p_evidence_urls is null or cardinality(p_evidence_urls) > 3 then
    raise exception using errcode = '22023', message = 'Report evidence is invalid';
  end if;
  foreach v_evidence_url in array p_evidence_urls loop
    if char_length(v_evidence_url) > 2000
       or v_evidence_url !~* '^https?://[^[:space:]]+$'
       or v_evidence_url ~* '^https?://[^/@]+@' then
      raise exception using errcode = '22023', message = 'Report evidence is invalid';
    end if;
  end loop;
  if (select count(*) from public.moderation_reports where reporter_id = v_actor and status in ('pending', 'in_review')) >= 10 then
    raise exception using errcode = '22023', message = 'Too many open reports';
  end if;
  select department.id into v_department from public.departments as department where department.slug = 'moderacao' and department.status = 'active';
  if v_department is null then raise exception using errcode = 'P0002', message = 'Moderation department is unavailable'; end if;

  insert into public.moderation_reports (reporter_id, target_user_id, department_id, content_type, content_id, reason, details, evidence_urls)
  values (v_actor, v_target, v_department, p_content_type, p_content_id, p_reason, btrim(coalesce(p_details, '')), p_evidence_urls)
  returning id into v_report_id;
  return v_report_id;
end;
$$;
revoke all on function public.submit_moderation_report(text, text, uuid, text, text, text[]) from public, anon, authenticated;
grant execute on function public.submit_moderation_report(text, text, uuid, text, text, text[]) to service_role;

-- Replace the current action handler so hide/restore applies to every supported target.
drop function if exists public.admin_review_moderation_report(text, uuid, text, text, text);
create function public.admin_review_moderation_report(
  p_session_token_hash text,
  p_report_id uuid,
  p_status text,
  p_internal_notes text default '',
  p_content_action text default 'none'
)
returns boolean
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_actor uuid;
  v_department uuid;
  v_reporter uuid;
  v_target uuid;
  v_content_type text;
  v_content_id uuid;
  v_rows integer;
begin
  v_actor := public.admin_current_actor(p_session_token_hash);
  if p_status not in ('in_review', 'resolved', 'dismissed')
     or char_length(coalesce(p_internal_notes, '')) > 8000
     or p_content_action not in ('none', 'hide', 'restore')
     or (p_status = 'in_review' and p_content_action <> 'none') then
    raise exception using errcode = '22023', message = 'Moderation decision is invalid';
  end if;
  select report.department_id, report.reporter_id, report.target_user_id, report.content_type, report.content_id
    into v_department, v_reporter, v_target, v_content_type, v_content_id
  from public.moderation_reports as report
  where report.id = p_report_id
    and (report.status in ('pending', 'in_review') or (p_content_action = 'restore' and report.status = 'resolved'))
  for update;
  if v_department is null then raise exception using errcode = 'P0002', message = 'Open moderation report not found'; end if;
  perform public.admin_assert_permission(v_actor, 'moderation.manage', v_department);

  if p_content_action in ('hide', 'restore') then
    if v_content_type = 'profile' then
      update public.profiles set moderation_hidden_at = case when p_content_action = 'hide' then coalesce(moderation_hidden_at, now()) else null end where id = v_content_id;
    elsif v_content_type = 'story' then
      update public.stories set moderation_hidden_at = case when p_content_action = 'hide' then coalesce(moderation_hidden_at, now()) else null end where id = v_content_id;
    elsif v_content_type = 'post' then
      update public.nook_posts set moderation_hidden_at = case when p_content_action = 'hide' then coalesce(moderation_hidden_at, now()) else null end where id = v_content_id;
    elsif v_content_type = 'chapter' then
      update public.chapters set moderation_hidden_at = case when p_content_action = 'hide' then coalesce(moderation_hidden_at, now()) else null end where id = v_content_id;
    elsif v_content_type = 'comment' then
      update public.comments set moderation_hidden_at = case when p_content_action = 'hide' then coalesce(moderation_hidden_at, now()) else null end where id = v_content_id;
    elsif v_content_type = 'review' then
      update public.story_reviews set moderation_hidden_at = case when p_content_action = 'hide' then coalesce(moderation_hidden_at, now()) else null end where id = v_content_id;
    elsif v_content_type = 'review_comment' then
      update public.review_comments set moderation_hidden_at = case when p_content_action = 'hide' then coalesce(moderation_hidden_at, now()) else null end where id = v_content_id;
    end if;
    get diagnostics v_rows = row_count;
    if v_rows = 0 then raise exception using errcode = 'P0002', message = 'Reported content not found'; end if;
  end if;

  update public.moderation_reports set status = p_status, internal_notes = btrim(coalesce(p_internal_notes, '')),
    reviewer_id = v_actor, reviewed_at = case when p_status in ('resolved', 'dismissed') then now() else null end,
    updated_at = now() where id = p_report_id;
  insert into public.admin_audit_log (actor_user_id, action, subject_type, subject_id, details)
  values (v_actor, 'moderation.report.' || p_status, 'moderation_report', p_report_id,
    jsonb_build_object('reporter_id', v_reporter, 'target_user_id', v_target, 'department_id', v_department,
      'content_type', v_content_type, 'content_id', v_content_id, 'content_action', p_content_action));
  if p_status in ('resolved', 'dismissed') then
    insert into public.user_notifications (user_id, notification_type, title, body, href)
    values (v_reporter, 'moderation_report_update', 'Atualização da denúncia',
      case when p_status = 'resolved' then 'A equipe concluiu a análise da sua denúncia.' else 'A equipe analisou sua denúncia e decidiu não aplicar uma medida.' end,
      '/notificacoes');
    if p_status = 'resolved' then
      insert into public.user_notifications (user_id, notification_type, title, body, href)
      values (v_target, 'moderation_decision', 'Decisão de moderação',
        'A equipe analisou um conteúdo associado à sua conta. Motivo informado: ' || p_reason || '. Você pode pedir revisão na página de recursos quando uma medida permitir recurso.',
        '/conta/recursos');
    end if;
  end if;
  return true;
end;
$$;
revoke all on function public.admin_review_moderation_report(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_review_moderation_report(text, uuid, text, text, text) to service_role;

create table if not exists public.moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  moderation_action_id uuid not null references public.moderation_actions(id) on delete restrict,
  appellant_id uuid not null references public.profiles(id) on delete restrict,
  details text not null check (char_length(details) between 1 and 5000),
  status text not null default 'pending' check (status in ('pending', 'in_review', 'accepted', 'rejected')),
  internal_notes text not null default '' check (char_length(internal_notes) <= 8000),
  reviewer_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (moderation_action_id, appellant_id)
);
create index if not exists moderation_appeals_status_created_idx on public.moderation_appeals(status, created_at desc);
create index if not exists moderation_appeals_appellant_created_idx on public.moderation_appeals(appellant_id, created_at desc);
alter table public.moderation_appeals enable row level security;
revoke all on table public.moderation_appeals from public, anon, authenticated;
grant all on table public.moderation_appeals to service_role;
create policy deny_direct_client_access on public.moderation_appeals for all to anon, authenticated using (false) with check (false);

insert into public.permissions (code, name, description, scope)
values ('moderation.appeals.manage', 'Analisar recursos', 'Analisar recursos de decisões de moderação nos departamentos autorizados.', 'department')
on conflict (code) do nothing;

create or replace function public.submit_moderation_appeal(p_session_token_hash text, p_action_id uuid, p_details text)
returns uuid
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_actor uuid;
  v_appeal uuid;
  v_target uuid;
  v_status text;
  v_starts timestamptz;
  v_ends timestamptz;
begin
  v_actor := public.admin_current_actor(p_session_token_hash);
  if char_length(btrim(coalesce(p_details, ''))) not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'Appeal details are invalid';
  end if;
  select action.target_profile_id, action.appeal_status, action.starts_at, action.ends_at
    into v_target, v_status, v_starts, v_ends
  from public.moderation_actions as action where action.id = p_action_id for update;
  if v_target is distinct from v_actor then raise exception using errcode = '42501', message = 'Action cannot be appealed by this account'; end if;
  if v_status <> 'not_requested' or v_starts > now() or (v_ends is not null and v_ends <= now()) then
    raise exception using errcode = '22023', message = 'This moderation decision cannot be appealed';
  end if;
  insert into public.moderation_appeals(moderation_action_id, appellant_id, details)
  values (p_action_id, v_actor, btrim(p_details)) returning id into v_appeal;
  update public.moderation_actions set appeal_status = 'pending' where id = p_action_id;
  return v_appeal;
end;
$$;
revoke all on function public.submit_moderation_appeal(text, uuid, text) from public, anon, authenticated;
grant execute on function public.submit_moderation_appeal(text, uuid, text) to service_role;

create or replace function public.admin_review_moderation_appeal(
  p_session_token_hash text, p_appeal_id uuid, p_status text, p_internal_notes text default ''
)
returns boolean
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_actor uuid;
  v_action uuid;
  v_target uuid;
  v_report uuid;
  v_department uuid;
  v_appellant uuid;
  v_action_type text;
begin
  v_actor := public.admin_current_actor(p_session_token_hash);
  if p_status not in ('in_review', 'accepted', 'rejected') or char_length(coalesce(p_internal_notes, '')) > 8000 then
    raise exception using errcode = '22023', message = 'Appeal decision is invalid';
  end if;
  select appeal.moderation_action_id, appeal.appellant_id, action.target_profile_id, action.report_id, report.department_id, action.action_type
    into v_action, v_appellant, v_target, v_report, v_department, v_action_type
  from public.moderation_appeals as appeal
  join public.moderation_actions as action on action.id = appeal.moderation_action_id
  left join public.moderation_reports as report on report.id = action.report_id
  where appeal.id = p_appeal_id and appeal.status in ('pending', 'in_review') for update of appeal;
  if v_action is null then raise exception using errcode = 'P0002', message = 'Pending appeal not found'; end if;
  if v_department is null then
    if not exists (select 1 from public.platform_admins where user_id = v_actor) then
      raise exception using errcode = '42501', message = 'Only platform administrators can review appeals without a report';
    end if;
  else
    perform public.admin_assert_permission(v_actor, 'moderation.appeals.manage', v_department);
  end if;
  update public.moderation_appeals set status = p_status, internal_notes = btrim(coalesce(p_internal_notes, '')),
    reviewer_id = v_actor, reviewed_at = case when p_status in ('accepted', 'rejected') then now() else null end
  where id = p_appeal_id;
  if p_status in ('accepted', 'rejected') then
    update public.moderation_actions set appeal_status = p_status,
      ends_at = case when p_status = 'accepted' then coalesce(ends_at, now()) else ends_at end
    where id = v_action;
    if p_status = 'accepted' and v_action_type in ('temporary_suspension', 'long_suspension', 'ban')
       and not exists (
         select 1 from public.moderation_actions as other_action
         where other_action.target_profile_id = v_target and other_action.id <> v_action
           and other_action.action_type in ('temporary_suspension', 'long_suspension', 'ban')
           and other_action.appeal_status <> 'accepted'
           and (other_action.ends_at is null or other_action.ends_at > now())
       ) then
      update public.auth_accounts set account_status = 'active' where id = v_target;
    end if;
    insert into public.moderation_actions(target_profile_id, report_id, moderator_id, action_type, reason, appeal_status)
    values (v_target, v_report, v_actor, case when p_status = 'accepted' then 'appeal_overturned' else 'appeal_rejected' end,
      case when p_status = 'accepted' then 'Recurso aceito após revisão humana.' else 'Recurso analisado e rejeitado após revisão humana.' end, p_status);
    insert into public.user_notifications(user_id, notification_type, title, body, href)
    values (v_appellant, 'moderation_appeal_decision', case when p_status = 'accepted' then 'Recurso aceito' else 'Recurso analisado' end,
      case when p_status = 'accepted' then 'Seu recurso foi aceito. Uma nova decisão foi registrada pela equipe.' else 'Seu recurso foi analisado. Consulte a área de notificações para ver a decisão.' end,
      '/notificacoes');
  end if;
  insert into public.admin_audit_log(actor_user_id, action, subject_type, subject_id, details)
  values (v_actor, 'moderation.appeal.' || p_status, 'moderation_appeal', p_appeal_id,
    jsonb_build_object('moderation_action_id', v_action, 'appellant_id', v_appellant, 'department_id', v_department));
  return true;
end;
$$;
revoke all on function public.admin_review_moderation_appeal(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_review_moderation_appeal(text, uuid, text, text) to service_role;

-- Preserve the existing account-management workflow while making suspensions appealable.
create or replace function public.admin_set_account_status(
  p_session_token_hash text, p_target_user_id uuid, p_status text, p_reason text default ''
)
returns boolean
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_actor uuid;
  v_previous text;
  v_reason text;
begin
  v_actor := public.admin_current_actor(p_session_token_hash);
  perform public.admin_assert_permission(v_actor, 'users.manage');
  if p_status not in ('active', 'suspended') or char_length(coalesce(p_reason, '')) > 1000 then
    raise exception using errcode = '22023', message = 'Account status or reason is invalid';
  end if;
  if v_actor = p_target_user_id then raise exception using errcode = '42501', message = 'You cannot change your own account status'; end if;
  if exists (select 1 from public.platform_admins where user_id = p_target_user_id) then
    raise exception using errcode = '42501', message = 'Primary administrator accounts are protected';
  end if;
  update public.auth_accounts set account_status = p_status where id = p_target_user_id returning account_status into v_previous;
  if v_previous is null then raise exception using errcode = 'P0002', message = 'Account not found'; end if;
  if p_status = 'suspended' then
    delete from public.auth_sessions where user_id = p_target_user_id;
    v_reason := coalesce(nullif(btrim(p_reason), ''), 'Conta suspensa pela equipe administrativa.');
    insert into public.moderation_actions(target_profile_id, moderator_id, action_type, reason)
    values (p_target_user_id, v_actor, 'long_suspension', v_reason);
  else
    update public.moderation_actions set ends_at = now()
    where target_profile_id = p_target_user_id and action_type in ('temporary_suspension', 'long_suspension', 'ban')
      and ends_at is null and appeal_status = 'not_requested';
  end if;
  insert into public.admin_audit_log(actor_user_id, action, subject_type, subject_id, details)
  values (v_actor, case when p_status = 'suspended' then 'user.suspended' else 'user.reactivated' end,
    'user', p_target_user_id, jsonb_build_object('status', p_status, 'reason', nullif(btrim(coalesce(p_reason, '')), '')));
  insert into public.user_notifications(user_id, notification_type, title, body, href)
  values (p_target_user_id,
    case when p_status = 'suspended' then 'account_suspended' else 'account_reactivated' end,
    case when p_status = 'suspended' then 'Conta suspensa' else 'Conta reativada' end,
    case when p_status = 'suspended'
      then 'Sua conta foi suspensa. Você pode consultar a decisão e solicitar revisão na página de recursos.'
      else 'Sua conta foi reativada. Você já pode entrar novamente.' end,
    case when p_status = 'suspended' then '/conta/recursos' else '/' end);
  return true;
end;
$$;
revoke all on function public.admin_set_account_status(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_account_status(text, uuid, text, text) to service_role;

-- Keep a deletion request after consensus deletes the story, so the decision history remains.
alter table public.story_deletion_requests alter column story_id drop not null;
alter table public.story_deletion_requests drop constraint if exists story_deletion_requests_story_id_fkey;
alter table public.story_deletion_requests add constraint story_deletion_requests_story_id_fkey
  foreign key (story_id) references public.stories(id) on delete set null;
alter table public.story_deletion_votes alter column approved drop not null;
alter table public.story_deletion_votes alter column decided_at drop not null;
alter table public.story_deletion_votes alter column decided_at drop default;

create or replace function public.request_story_deletion(p_session_token_hash text, p_story_id uuid)
returns uuid
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_actor uuid;
  v_owner uuid;
  v_request uuid;
  v_title text;
begin
  v_actor := public.admin_current_actor(p_session_token_hash);
  select story.author_id, story.title into v_owner, v_title from public.stories as story where story.id = p_story_id for update;
  if v_owner is null then raise exception using errcode = 'P0002', message = 'Story not found'; end if;
  if v_actor <> v_owner and not exists (
    select 1 from public.story_collaborators as collaborator
    where collaborator.story_id = p_story_id and collaborator.profile_id = v_actor
      and collaborator.role = 'coauthor' and collaborator.status = 'active'
  ) then raise exception using errcode = '42501', message = 'Only active coauthors can request deletion'; end if;

  insert into public.story_deletion_requests(story_id, requested_by)
  values (p_story_id, v_actor) returning id into v_request;
  insert into public.story_deletion_votes(request_id, coauthor_id, approved, decided_at)
  select v_request, participant.profile_id, participant.profile_id = v_actor,
    case when participant.profile_id = v_actor then now() else null end
  from (
    select v_owner as profile_id
    union
    select collaborator.profile_id from public.story_collaborators as collaborator
    where collaborator.story_id = p_story_id and collaborator.role = 'coauthor' and collaborator.status = 'active'
  ) as participant;

  insert into public.user_notifications(user_id, notification_type, title, body, href)
  select vote.coauthor_id, 'story_deletion_request', 'Solicitação para excluir uma história',
    'Um coautor solicitou a exclusão de “' || coalesce(v_title, 'uma história') || '”. A obra só será excluída se todos os coautores ativos aprovarem.',
    '/editar-historia/' || p_story_id::text
  from public.story_deletion_votes as vote where vote.request_id = v_request and vote.coauthor_id <> v_actor;

  if not exists (select 1 from public.story_deletion_votes where request_id = v_request and approved is distinct from true) then
    update public.story_deletion_requests set status = 'approved', decided_at = now() where id = v_request;
    delete from public.stories where id = p_story_id;
  end if;
  return v_request;
end;
$$;
revoke all on function public.request_story_deletion(text, uuid) from public, anon, authenticated;
grant execute on function public.request_story_deletion(text, uuid) to service_role;

create or replace function public.decide_story_deletion(p_session_token_hash text, p_request_id uuid, p_approved boolean)
returns text
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_actor uuid;
  v_story_id uuid;
  v_title text;
  v_status text;
  v_rows integer;
begin
  v_actor := public.admin_current_actor(p_session_token_hash);
  select request.story_id, story.title, request.status into v_story_id, v_title, v_status
  from public.story_deletion_requests as request
  left join public.stories as story on story.id = request.story_id
  where request.id = p_request_id for update of request;
  if v_status is distinct from 'pending' then raise exception using errcode = 'P0002', message = 'Pending deletion request not found'; end if;
  update public.story_deletion_votes set approved = p_approved, decided_at = now()
  where request_id = p_request_id and coauthor_id = v_actor and approved is null;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception using errcode = '42501', message = 'No pending coauthor vote for this account'; end if;

  if p_approved is false then
    update public.story_deletion_requests set status = 'rejected', decided_at = now() where id = p_request_id;
    insert into public.user_notifications(user_id, notification_type, title, body, href)
    select vote.coauthor_id, 'story_deletion_rejected', 'Solicitação de exclusão recusada',
      'Um coautor recusou a exclusão de “' || coalesce(v_title, 'uma história') || '”. A história permanecerá publicada.',
      case when v_story_id is null then '/notificacoes' else '/historia/' || v_story_id::text end
    from public.story_deletion_votes as vote where vote.request_id = p_request_id and vote.coauthor_id <> v_actor;
    return 'rejected';
  end if;

  if exists (select 1 from public.story_deletion_votes where request_id = p_request_id and approved is distinct from true) then
    insert into public.user_notifications(user_id, notification_type, title, body, href)
    select request.requested_by, 'story_deletion_vote', 'Voto recebido sobre exclusão',
      'Um coautor aprovou a solicitação de exclusão de “' || coalesce(v_title, 'uma história') || '”.',
      case when v_story_id is null then '/notificacoes' else '/editar-historia/' || v_story_id::text end
    from public.story_deletion_requests as request where request.id = p_request_id and request.requested_by <> v_actor;
    return 'pending';
  end if;

  update public.story_deletion_requests set status = 'approved', decided_at = now() where id = p_request_id;
  insert into public.user_notifications(user_id, notification_type, title, body, href)
  select vote.coauthor_id, 'story_deletion_approved', 'Exclusão aprovada',
    'Todos os coautores aprovaram a exclusão de “' || coalesce(v_title, 'uma história') || '”. A obra foi excluída.', '/notificacoes'
  from public.story_deletion_votes as vote where vote.request_id = p_request_id and vote.coauthor_id <> v_actor;
  delete from public.stories where id = v_story_id;
  return 'approved';
end;
$$;
revoke all on function public.decide_story_deletion(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.decide_story_deletion(text, uuid, boolean) to service_role;

-- Formal requests to correct missing content warnings. The author may report a
-- correction, but a moderator must review and close the request; no story is
-- removed automatically when a deadline passes.
create table if not exists public.content_warning_corrections (
  id uuid primary key default gen_random_uuid(),
  -- Keep a historical story UUID after a story is deleted; do not block the
  -- existing account/story deletion workflows with moderation history.
  story_id uuid not null,
  author_user_id uuid references public.auth_accounts(id) on delete set null,
  department_id uuid not null references public.departments(id) on delete restrict,
  source_report_id uuid references public.moderation_reports(id) on delete set null,
  moderator_user_id uuid references public.auth_accounts(id) on delete set null,
  missing_warnings text[] not null check (cardinality(missing_warnings) between 1 and 12),
  notice text not null check (char_length(btrim(notice)) between 1 and 2000),
  due_at timestamptz not null,
  author_response text not null default '' check (char_length(author_response) <= 2000),
  internal_notes text not null default '' check (char_length(internal_notes) <= 4000),
  status text not null default 'requested' check (status in ('requested', 'submitted', 'resolved', 'cancelled')),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  decided_at timestamptz,
  decision text check (decision in ('corrected', 'not_corrected', 'cancelled'))
);

create index if not exists content_warning_corrections_author_status_idx
  on public.content_warning_corrections(author_user_id, status, due_at);
create index if not exists content_warning_corrections_department_status_idx
  on public.content_warning_corrections(department_id, status, due_at);
create unique index if not exists content_warning_corrections_one_open_story_idx
  on public.content_warning_corrections(story_id)
  where status in ('requested', 'submitted');

alter table public.content_warning_corrections enable row level security;
revoke all on table public.content_warning_corrections from public, anon, authenticated;
grant select, insert, update on table public.content_warning_corrections to service_role;

create or replace function public.admin_create_content_warning_correction(
  p_session_token_hash text,
  p_story_id uuid,
  p_source_report_id uuid,
  p_missing_warnings text[],
  p_notice text,
  p_due_at timestamptz
)
returns uuid
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_actor uuid;
  v_author uuid;
  v_department uuid;
  v_id uuid;
  v_warning text;
begin
  v_actor := public.admin_current_actor(p_session_token_hash);
  select story.author_id into v_author
  from public.stories as story
  where story.id = p_story_id
  for update;
  if v_author is null then
    raise exception using errcode = 'P0002', message = 'Story not found';
  end if;
  select department.id into v_department
  from public.departments as department
  where department.slug = 'moderacao' and department.status = 'active';
  if v_department is null then
    raise exception using errcode = 'P0002', message = 'Moderation department is unavailable';
  end if;
  perform public.admin_assert_permission(v_actor, 'moderation.manage', v_department);
  if p_source_report_id is not null and not exists (
    select 1 from public.moderation_reports as report
    where report.id = p_source_report_id
      and report.content_type = 'story'
      and report.content_id = p_story_id
  ) then
    raise exception using errcode = '22023', message = 'Source report does not match the story';
  end if;
  if p_missing_warnings is null or cardinality(p_missing_warnings) not between 1 and 12
     or p_notice is null or char_length(btrim(p_notice)) not between 1 and 2000
     or p_due_at <= now() + interval '1 hour'
     or p_due_at > now() + interval '30 days' then
    raise exception using errcode = '22023', message = 'Correction request details are invalid';
  end if;
  foreach v_warning in array p_missing_warnings loop
    if char_length(btrim(v_warning)) not between 1 and 100 then
      raise exception using errcode = '22023', message = 'A warning label is invalid';
    end if;
  end loop;
  insert into public.content_warning_corrections (
    story_id, author_user_id, department_id, source_report_id, moderator_user_id,
    missing_warnings, notice, due_at
  ) values (
    p_story_id, v_author, v_department, p_source_report_id, v_actor,
    (select array_agg(distinct btrim(label)) from unnest(p_missing_warnings) as warnings(label)),
    btrim(p_notice), p_due_at
  ) returning id into v_id;

  insert into public.admin_audit_log(actor_user_id, action, subject_type, subject_id, details)
  values (v_actor, 'moderation.content_warning_correction.requested', 'content_warning_correction', v_id,
    jsonb_build_object('story_id', p_story_id, 'author_user_id', v_author,
      'source_report_id', p_source_report_id, 'missing_warnings', p_missing_warnings, 'due_at', p_due_at));
  insert into public.user_notifications(user_id, notification_type, title, body, href)
  values (v_author, 'content_warning_correction_requested', 'Ajuste de avisos de conteúdo solicitado',
    'A moderação solicitou que você revise os avisos da sua história até ' || to_char(p_due_at at time zone 'UTC', 'DD/MM/YYYY "às" HH24:MI') || ' UTC.',
    '/conta/avisos-de-conteudo');
  return v_id;
end;
$$;

create or replace function public.submit_content_warning_correction(
  p_session_token_hash text,
  p_correction_id uuid,
  p_author_response text
)
returns boolean
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_actor uuid;
  v_author uuid;
begin
  v_actor := public.admin_current_actor(p_session_token_hash);
  if char_length(btrim(coalesce(p_author_response, ''))) not between 1 and 2000 then
    raise exception using errcode = '22023', message = 'A correction response is required';
  end if;
  update public.content_warning_corrections
  set status = 'submitted', author_response = btrim(p_author_response), submitted_at = now()
  where id = p_correction_id and author_user_id = v_actor and status = 'requested'
  returning author_user_id into v_author;
  if v_author is null then
    raise exception using errcode = 'P0002', message = 'Open correction request not found';
  end if;
  insert into public.admin_audit_log(actor_user_id, action, subject_type, subject_id, details)
  values (v_actor, 'moderation.content_warning_correction.submitted', 'content_warning_correction', p_correction_id,
    jsonb_build_object('author_user_id', v_author));
  insert into public.user_notifications(user_id, notification_type, title, body, href)
  select distinct membership.user_id, 'content_warning_correction_submitted', 'Correção enviada para análise',
    'O autor informou que atualizou os avisos de conteúdo de uma história.', '/admin'
  from public.team_memberships as membership
  join public.team_role_permissions as grant_row on grant_row.role_id = membership.role_id
  where membership.department_id = (select request.department_id from public.content_warning_corrections as request where request.id = p_correction_id)
    and membership.status = 'active' and grant_row.permission_code = 'moderation.manage';
  return true;
end;
$$;

create or replace function public.admin_decide_content_warning_correction(
  p_session_token_hash text,
  p_correction_id uuid,
  p_decision text,
  p_internal_notes text default ''
)
returns boolean
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_actor uuid;
  v_author uuid;
  v_department uuid;
  v_story_id uuid;
begin
  v_actor := public.admin_current_actor(p_session_token_hash);
  if p_decision not in ('corrected', 'not_corrected', 'cancelled')
     or char_length(coalesce(p_internal_notes, '')) > 4000 then
    raise exception using errcode = '22023', message = 'Correction decision is invalid';
  end if;
  select request.author_user_id, request.department_id, request.story_id
    into v_author, v_department, v_story_id
  from public.content_warning_corrections as request
  where request.id = p_correction_id and request.status in ('requested', 'submitted')
  for update;
  if v_author is null then
    raise exception using errcode = 'P0002', message = 'Open correction request not found';
  end if;
  perform public.admin_assert_permission(v_actor, 'moderation.manage', v_department);
  update public.content_warning_corrections
  set status = case when p_decision = 'cancelled' then 'cancelled' else 'resolved' end,
      decision = p_decision, internal_notes = btrim(coalesce(p_internal_notes, '')), decided_at = now()
  where id = p_correction_id;
  insert into public.admin_audit_log(actor_user_id, action, subject_type, subject_id, details)
  values (v_actor, 'moderation.content_warning_correction.' || p_decision, 'content_warning_correction', p_correction_id,
    jsonb_build_object('story_id', v_story_id, 'author_user_id', v_author, 'internal_notes', p_internal_notes));
  insert into public.user_notifications(user_id, notification_type, title, body, href)
  values (v_author, 'content_warning_correction_decided',
    case when p_decision = 'corrected' then 'Avisos de conteúdo revisados' else 'Solicitação de ajuste revisada' end,
    case when p_decision = 'corrected' then 'A moderação confirmou a correção dos avisos de conteúdo.'
      when p_decision = 'not_corrected' then 'A moderação concluiu que os avisos ainda precisam de ajuste. Consulte a solicitação e as orientações.'
      else 'A solicitação de ajuste foi cancelada pela moderação.' end,
    '/conta/avisos-de-conteudo');
  return true;
end;
$$;

revoke all on function public.admin_create_content_warning_correction(text, uuid, uuid, text[], text, timestamptz) from public, anon, authenticated;
grant execute on function public.admin_create_content_warning_correction(text, uuid, uuid, text[], text, timestamptz) to service_role;
revoke all on function public.submit_content_warning_correction(text, uuid, text) from public, anon, authenticated;
grant execute on function public.submit_content_warning_correction(text, uuid, text) to service_role;
revoke all on function public.admin_decide_content_warning_correction(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_decide_content_warning_correction(text, uuid, text, text) to service_role;

alter table public.profiles
  add column if not exists reviewer_portfolio_enabled boolean not null default true,
  add column if not exists beta_reader_portfolio_enabled boolean not null default true,
  add column if not exists translator_portfolio_enabled boolean not null default true;
