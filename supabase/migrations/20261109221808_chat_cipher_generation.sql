-- Separate the new chat history without changing groups, blocks, reports or old ciphertext.
alter table public.chat_messages
  add column cipher_version smallint generated always as (
    case when left(body_cipher, 3) = 'v2:' then 2 else 1 end
  ) stored,
  add constraint chat_v2_media_path check (
    cipher_version = 1 or media_path is null
    or media_path = 'v2/' || thread_id::text || '/' || id::text || '.enc'
  );

create index chat_messages_thread_version_idx
  on public.chat_messages (thread_id, cipher_version, created_at desc, id desc);
