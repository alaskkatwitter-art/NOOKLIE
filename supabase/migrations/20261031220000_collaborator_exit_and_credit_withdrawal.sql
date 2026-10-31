create or replace function public.leave_story_collaboration(
  p_session_token_hash text,
  p_story_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_actor uuid;
  v_membership_id uuid;
  v_story_title text;
  v_story_author uuid;
  v_recipient_id uuid;
  v_now timestamptz := now();
begin
  select session.user_id
    into v_actor
  from public.auth_sessions as session
  where session.token_hash = p_session_token_hash
    and session.expires_at > v_now;

  if v_actor is null then
    raise exception using errcode = '42501', message = 'A valid account session is required';
  end if;

  if p_role is null or p_role not in ('coauthor', 'designer', 'reviewer', 'beta_reader', 'translator') then
    raise exception using errcode = '22023', message = 'Unsupported collaboration role';
  end if;

  select collaborator.id
    into v_membership_id
  from public.story_collaborators as collaborator
  where collaborator.story_id = p_story_id
    and collaborator.profile_id = v_actor
    and collaborator.role = p_role
    and collaborator.status = 'active'
  for update;

  if v_membership_id is null then
    raise exception using errcode = 'P0002', message = 'Active collaboration not found';
  end if;

  select story.title, story.author_id
    into v_story_title, v_story_author
  from public.stories as story
  where story.id = p_story_id;

  update public.story_collaborators
  set status = 'left', removed_at = v_now
  where id = v_membership_id;

  if p_role <> 'coauthor' then
    update public.story_credits
    set status = 'withdrawn', decided_at = v_now
    where story_id = p_story_id
      and contributor_id = v_actor
      and role = p_role
      and status in ('pending', 'accepted');
  end if;

  for v_recipient_id in
    select v_story_author
    where v_story_author is not null and v_story_author <> v_actor
    union
    select collaborator.profile_id
    from public.story_collaborators as collaborator
    where collaborator.story_id = p_story_id
      and collaborator.status = 'active'
      and collaborator.profile_id <> v_actor
  loop
    insert into public.user_notifications (user_id, notification_type, title, body, href)
    values (
      v_recipient_id,
      case when p_role = 'coauthor' then 'collaboration_left' else 'credit_withdrawn' end,
      case when p_role = 'coauthor' then 'Coautor saiu da história' else 'Crédito retirado' end,
      case when p_role = 'coauthor'
        then 'Um coautor saiu de “' || coalesce(v_story_title, 'uma história') || '”.'
        else 'Um colaborador retirou a confirmação de crédito em “' || coalesce(v_story_title, 'uma história') || '”.'
      end,
      '/historia/' || p_story_id::text
    );
  end loop;

  return jsonb_build_object('left', true, 'role', p_role);
end;
$$;

revoke all on function public.leave_story_collaboration(text, uuid, text) from public, anon, authenticated;
grant execute on function public.leave_story_collaboration(text, uuid, text) to service_role;

comment on function public.leave_story_collaboration(text, uuid, text) is
  'Lets the authenticated collaborator leave their own role and withdraws non-author credits atomically.';
