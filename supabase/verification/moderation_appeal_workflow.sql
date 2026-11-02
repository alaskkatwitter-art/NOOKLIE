-- Run after the extended moderation and appeals migration.
-- The test data is rolled back inside a subtransaction.
do $$
declare
  root_id uuid;
  target_id uuid;
  action_id uuid;
  appeal_id uuid;
BEGIN
  SELECT account.id INTO root_id
  FROM public.platform_admins admin
  JOIN public.auth_accounts account ON account.id=admin.user_id
  WHERE account.username='astriddy';
  IF root_id IS NULL THEN RAISE EXCEPTION 'Primary admin fixture is unavailable'; END IF;

  select id into target_id from public.profiles
  where not exists (select 1 from public.platform_admins where user_id = profiles.user_id)
  order by created_at limit 1;
  if target_id is null then raise exception 'A non-admin profile fixture is unavailable'; end if;

  begin
    insert into public.auth_sessions(id, user_id, token_hash, expires_at)
    values (gen_random_uuid(), root_id, repeat('v',64), now()+interval '5 minutes'),
           (gen_random_uuid(), target_id, repeat('w',64), now()+interval '5 minutes');
    insert into public.moderation_actions(target_profile_id, moderator_id, action_type, reason)
    values (target_id, root_id, 'warning', 'Verification warning') returning id into action_id;
    appeal_id := public.submit_moderation_appeal(repeat('w',64), action_id, 'Solicito revisão desta decisão.');
    if not exists (select 1 from public.moderation_actions where id=action_id and appeal_status='pending') then
      raise exception 'Appeal submission did not mark the action pending';
    end if;
    perform public.admin_review_moderation_appeal(repeat('v',64), appeal_id, 'accepted', 'Revisão de teste');
    if not exists (select 1 from public.moderation_appeals where id=appeal_id and status='accepted') then
      raise exception 'Appeal decision did not persist';
    end if;
    if not exists (select 1 from public.user_notifications where user_id=target_id and notification_type='moderation_appeal_decision') then
      raise exception 'Appeal decision did not notify the account';
    end if;
    if not exists (select 1 from public.admin_audit_log where subject_id=appeal_id and action='moderation.appeal.accepted') then
      raise exception 'Appeal decision was not audited';
    end if;
    raise exception using errcode='P0001', message='rollback_appeal_test';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'rollback_appeal_test' then raise; end if;
  end;
end;
$$;

DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.moderation_appeals WHERE details='Solicito revisão desta decisão.') THEN
    RAISE EXCEPTION 'Appeal verification row was not rolled back';
  END IF;
  IF EXISTS (SELECT 1 FROM public.auth_sessions WHERE token_hash IN (repeat('v',64), repeat('w',64))) THEN
    RAISE EXCEPTION 'Appeal verification sessions were not rolled back';
  END IF;
  IF has_table_privilege('anon', 'public.moderation_appeals', 'SELECT')
     OR has_table_privilege('authenticated', 'public.moderation_appeals', 'SELECT') THEN
    RAISE EXCEPTION 'Appeal data is directly readable by a client role';
  END IF;
END;
$test$;