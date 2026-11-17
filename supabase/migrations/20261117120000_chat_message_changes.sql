alter table public.chat_messages
  add column edited_at timestamptz,
  add column revoked_at timestamptz;

alter table public.chat_reports add column message_snapshot jsonb;

-- Preserve only evidence that a participant explicitly reported.
create function public.snapshot_chat_report() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.message_id is not null then
    select jsonb_build_object(
      'id', m.id, 'thread_id', m.thread_id, 'sender_id', m.sender_id, 'body_cipher', m.body_cipher,
      'created_at', m.created_at, 'media_type', m.media_type, 'cipher_version', m.cipher_version
    ) into new.message_snapshot
    from chat_messages m where m.id = new.message_id and m.thread_id = new.thread_id
      and m.revoked_at is null for share;
    if new.message_snapshot is null then
      raise exception 'Message unavailable';
    end if;
  end if;
  return new;
end;
$$;

create trigger chat_report_snapshot before insert on public.chat_reports
for each row execute function public.snapshot_chat_report();

update public.chat_reports r
set message_snapshot = jsonb_build_object(
  'id', m.id, 'thread_id', m.thread_id, 'sender_id', m.sender_id, 'body_cipher', m.body_cipher,
  'created_at', m.created_at, 'media_type', m.media_type, 'cipher_version', m.cipher_version
)
from public.chat_messages m where m.id = r.message_id and m.thread_id = r.thread_id;

create function public.change_own_chat_message(
  p_sender uuid, p_thread uuid, p_message uuid, p_version integer,
  p_cipher text, p_revoke boolean
) returns table(changed_at timestamptz, attachment_path text)
language plpgsql set search_path = public as $$
declare
  message chat_messages%rowtype;
  changed timestamptz;
begin
  select * into message from chat_messages m
  where m.id = p_message and m.thread_id = p_thread and m.sender_id = p_sender
    and m.cipher_version = p_version and m.revoked_at is null for update;
  if not found then return; end if;
  changed := clock_timestamp();
  if message.created_at <= changed - interval '2 hours' then return; end if;

  if p_revoke then
    update chat_messages set revoked_at = changed, body_cipher = p_cipher,
      media_path = null, media_type = null, is_sticker = false, reply_to = null
    where id = p_message;
  else
    update chat_messages set edited_at = changed, body_cipher = p_cipher where id = p_message;
  end if;
  return query select changed, case when p_revoke then message.media_path end;
end;
$$;
revoke all on function public.change_own_chat_message(uuid, uuid, uuid, integer, text, boolean)
  from public, anon, authenticated;
grant execute on function public.change_own_chat_message(uuid, uuid, uuid, integer, text, boolean)
  to service_role;
