create function public.notify_literary_event(p_event uuid)
returns integer language plpgsql set search_path = public as $$
declare sent integer;
begin
  insert into user_notifications (user_id, notification_type, title, body, href, source_key)
  select account.id, 'literary_event', event.title,
    'Novo evento literário no Nooklie. Veja os detalhes e saiba como participar.',
    '/eventos?evento=' || event.id::text, 'literary-event:' || event.id::text
  from story_events event
  cross join auth_accounts account
  where event.id = p_event and event.active and event.ends_at > now()
    and account.account_status = 'active'
  on conflict (user_id, source_key) do nothing;
  get diagnostics sent = row_count;
  return sent;
end;
$$;
revoke all on function public.notify_literary_event(uuid) from public, anon, authenticated;
grant execute on function public.notify_literary_event(uuid) to service_role;

create function public.announce_published_literary_event()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.active and (tg_op = 'INSERT' or not old.active) then
    perform public.notify_literary_event(new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.announce_published_literary_event() from public, anon, authenticated;
grant execute on function public.announce_published_literary_event() to service_role;

create trigger announce_literary_event after insert or update of active on public.story_events
for each row execute function public.announce_published_literary_event();
