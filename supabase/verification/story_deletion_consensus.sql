-- Run after the literary collaboration and extended moderation migrations.
-- Creates temporary stories and a coauthor, then rolls the entire exercise back.
do $$
declare
  root_id uuid;
  coauthor_id uuid;
  approved_story uuid;
  rejected_story uuid;
  approved_request uuid;
  rejected_request uuid;
BEGIN
  SELECT account.id INTO root_id
  FROM public.platform_admins admin
  JOIN public.auth_accounts account ON account.id=admin.user_id
  WHERE account.username='astriddy';
  IF root_id IS NULL THEN RAISE EXCEPTION 'Primary admin fixture is unavailable'; END IF;

  select id into coauthor_id from public.profiles
  where not exists (select 1 from public.platform_admins where user_id = profiles.user_id)
  order by created_at limit 1;
  if coauthor_id is null then raise exception 'A non-admin coauthor fixture is unavailable'; end if;

  begin
    insert into public.auth_sessions(id, user_id, token_hash, expires_at)
    values (gen_random_uuid(), root_id, repeat('x',64), now()+interval '5 minutes'),
           (gen_random_uuid(), coauthor_id, repeat('y',64), now()+interval '5 minutes');
    insert into public.stories(author_id, title) values (root_id, '__deletion_consensus_approved') returning id into approved_story;
    insert into public.story_collaborators(story_id, profile_id, role, status, invited_by, accepted_at)
    values (approved_story, coauthor_id, 'coauthor', 'active', root_id, now());
    approved_request := public.request_story_deletion(repeat('x',64), approved_story);
    perform public.decide_story_deletion(repeat('y',64), approved_request, true);
    if exists (select 1 from public.stories where id=approved_story) then raise exception 'Unanimous approval did not delete the story'; end if;
    if not exists (select 1 from public.story_deletion_requests where id=approved_request and story_id is null and status='approved') then
      raise exception 'Approved deletion history was not preserved';
    end if;

    insert into public.stories(author_id, title) values (root_id, '__deletion_consensus_rejected') returning id into rejected_story;
    insert into public.story_collaborators(story_id, profile_id, role, status, invited_by, accepted_at)
    values (rejected_story, coauthor_id, 'coauthor', 'active', root_id, now());
    rejected_request := public.request_story_deletion(repeat('x',64), rejected_story);
    perform public.decide_story_deletion(repeat('y',64), rejected_request, false);
    if not exists (select 1 from public.stories where id=rejected_story) then raise exception 'A rejection did not keep the story'; end if;
    if not exists (select 1 from public.story_deletion_requests where id=rejected_request and status='rejected') then
      raise exception 'Rejected deletion request was not recorded';
    end if;
    raise exception using errcode='P0001', message='rollback_story_deletion_test';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rollback_story_deletion_test' then raise; end if;
  end;
end;
$$;

select not exists(select 1 from public.stories where title like '__deletion_consensus_%') as stories_rolled_back,
       not exists(select 1 from public.story_deletion_requests where story_id in (select id from public.stories where title like '__deletion_consensus_%')) as requests_rolled_back,
       not exists(select 1 from public.auth_sessions where token_hash in (repeat('x',64), repeat('y',64))) as sessions_rolled_back;
