-- Pending migration: account-level reader appearance only; no chapter content or progress changes.
create table public.reader_preferences (
  user_id uuid primary key references public.auth_accounts(id) on delete cascade,
  preferences jsonb not null,
  updated_at timestamptz not null default now(),
  constraint reader_preferences_valid check (
    jsonb_typeof(preferences) = 'object'
    and preferences ?& array['fontId','fontSize','lineHeight','margin','theme']
    and preferences - array['fontId','fontSize','lineHeight','margin','theme'] = '{}'::jsonb
    and jsonb_typeof(preferences->'fontId') = 'string'
    and preferences->>'fontId' in ('browser-serif','lora','merriweather','literata','newsreader','eb-garamond','source-serif-4','libre-baskerville','nunito','dm-sans','lexend','atkinson-hyperlegible','open-sans')
    and jsonb_typeof(preferences->'fontSize') = 'number'
    and (preferences->>'fontSize')::numeric between 14 and 40
    and jsonb_typeof(preferences->'lineHeight') = 'number'
    and (preferences->>'lineHeight')::numeric between 1.2 and 2.5
    and jsonb_typeof(preferences->'margin') = 'number'
    and (preferences->>'margin')::numeric between 0 and 64
    and jsonb_typeof(preferences->'theme') = 'string'
    and preferences->>'theme' in ('dark','light','sepia','system')
  )
);
alter table public.reader_preferences enable row level security;
revoke all on table public.reader_preferences from public, anon, authenticated;
grant select, insert, update on table public.reader_preferences to service_role;
comment on table public.reader_preferences is 'Appearance preferences scoped by authenticated account; server-only access.';
