-- Run after the literary collaboration and extended moderation migrations.
-- Creates temporary stories and a coauthor, then rolls the entire exercise back.
do $$
declare
  root_id uuid;
  v_coauthor_id uuid;
  approved_story uuid;
  rejected_story uuid;
  approved_request uuid;
  rejected_request uuid;
begin
  SELECT account.id INTO root_id
  FROM public.platform_admins admin
  JOIN public.auth_accounts account ON account.id=admin.user_id
  WHERE account.username='astriddy';
  IF root_id IS NULL THEN RAISE EXCEPTION 'Primary admin fixture is unavailable'; END IF;

  select id into v_coauthor_id from public.profiles
  where not exists (select 1 from public.platform_admins where user_id = profiles.user_id)
  order by created_at limit 1;
  if v_coauthor_id is null then raise exception 'A non-admin coauthor fixture is unavailable'; end if;

  begin
    insert into public.auth_sessions(id, user_id, token_hash, expires_at)
    values (gen_random_uuid(), root_id, repeat('x',64), now()+interval '5 minutes'),
           (gen_random_uuid(), v_coauthor_id, repeat('y',64), now()+interval '5 minutes');
    insert into public.stories(author_id, title) values (root_id, '__deletion_consensus_approved') returning id into approved_story;
    insert into public.story_collaborators(story_id, profile_id, role, status, invited_by, accepted_at)
    values (approved_story, v_coauthor_id, 'coauthor', 'active', root_id, now());
    approved_request := public.request_story_deletion(repeat('x',64), approved_story);
    if not exists (select 1 from public.story_deletion_votes
      where request_id=approved_request and coauthor_id=root_id and approved is true and decided_at is not null) then
      raise exception 'The requester must start with an approved vote';
    end if;
    if not exists (select 1 from public.story_deletion_votes
      where request_id=approved_request and coauthor_id=v_coauthor_id and approved is null and decided_at is null) then
      raise exception 'Other coauthors must start with an undecided vote';
    end if;
    if not exists (select 1 from public.stories where id=approved_story) then
      raise exception 'The story was deleted before unanimous approval';
    end if;
    perform public.decide_story_deletion(repeat('y',64), approved_request, true);
    if exists (select 1 from public.stories where id=approved_story) then raise exception 'Unanimous approval did not delete the story'; end if;
    if not exists (select 1 from public.story_deletion_requests where id=approved_request and story_id is null and status='approved') then
      raise exception 'Approved deletion history was not preserved';
    end if;

    insert into public.stories(author_id, title) values (root_id, '__deletion_consensus_rejected') returning id into rejected_story;
    insert into public.story_collaborators(story_id, profile_id, role, status, invited_by, accepted_at)
    values (rejected_story, v_coauthor_id, 'coauthor', 'active', root_id, now());
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

  if EXISTS (SELECT 1 FROM public.stories WHERE id IN (approved_story,rejected_story)) THEN
    RAISE EXCEPTION 'Story deletion test stories were not rolled back';
  END IF;
  if EXISTS (SELECT 1 FROM public.story_deletion_requests WHERE id IN (approved_request,rejected_request)) THEN
    RAISE EXCEPTION 'Story deletion test requests were not rolled back';
  END IF;
  if EXISTS (SELECT 1 FROM public.auth_sessions WHERE token_hash IN (repeat('x',64),repeat('y',64))) THEN
    RAISE EXCEPTION 'Story deletion test sessions were not rolled back';
  END IF;
end;
$$;
