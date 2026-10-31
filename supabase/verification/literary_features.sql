-- Run in the Supabase SQL editor after the literary feature migration.
-- Fails loudly if any new table is reachable by browser roles or lacks RLS.
do $$
declare
  table_name text;
  required_tables text[] := array[
    'story_reviews', 'review_likes', 'review_comments', 'chapter_favorites', 'user_blocks',
    'story_collaborators', 'collaborator_invites', 'story_credits', 'story_deletion_requests',
    'story_deletion_votes', 'story_edit_history', 'policy_documents', 'policy_acceptances',
    'moderation_actions', 'moderation_appeals', 'account_lifecycle_requests', 'story_anonymity_events'
  ];
  table_oid oid;
begin
  foreach table_name in array required_tables loop
    table_oid := to_regclass(format('public.%I', table_name));
    if table_oid is null then
      raise exception 'Required table public.% is missing', table_name;
    end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = table_oid) then
      raise exception 'RLS is not enabled on public.%', table_name;
    end if;
    if has_table_privilege('anon', table_oid, 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'anon has direct privileges on public.%', table_name;
    end if;
    if has_table_privilege('authenticated', table_oid, 'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'authenticated has direct privileges on public.%', table_name;
    end if;
    if not has_table_privilege('service_role', table_oid, 'SELECT,INSERT') then
      raise exception 'service_role cannot access public.%', table_name;
    end if;
  end loop;

  if has_table_privilege('service_role', 'public.story_edit_history', 'UPDATE,DELETE,TRUNCATE') then
    raise exception 'Story edit history must be append-only for service_role';
  end if;
  if has_table_privilege('service_role', 'public.story_anonymity_events', 'UPDATE,DELETE,TRUNCATE') then
    raise exception 'Story anonymity history must be append-only for service_role';
  end if;
  if has_table_privilege('service_role', 'public.moderation_actions', 'UPDATE,DELETE,TRUNCATE') then
    raise exception 'Moderation action history must be append-only for service_role';
  end if;
  if not has_column_privilege('service_role', 'public.moderation_actions', 'appeal_status', 'UPDATE') then
    raise exception 'service_role needs column-only update access for the appeal state';
  end if;
  if not has_column_privilege('service_role', 'public.moderation_actions', 'ends_at', 'UPDATE') then
    raise exception 'service_role needs column-only update access for suspension end times';
  end if;

  if to_regprocedure('public.leave_story_collaboration(text,uuid,text)') is null then
    raise exception 'Self-service collaboration exit function is missing';
  end if;
  if has_function_privilege('authenticated', 'public.leave_story_collaboration(text,uuid,text)', 'EXECUTE') then
    raise exception 'Browser roles must not execute the collaboration exit function directly';
  end if;
  if not has_function_privilege('service_role', 'public.leave_story_collaboration(text,uuid,text)', 'EXECUTE') then
    raise exception 'Backend service role must be able to execute the collaboration exit function';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.story_reviews'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%story_id, reviewer_id%'
  ) then
    raise exception 'One-review-per-profile uniqueness constraint is missing';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.chapter_favorites'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) like '%chapter_id, user_id%'
  ) then
    raise exception 'Chapter favorite uniqueness constraint is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.stories'::regclass
      and conname = 'stories_rating_allowed_check'
      and contype = 'c'
  ) then
    raise exception 'Story age-rating constraint is missing';
  end if;
end;
$;
