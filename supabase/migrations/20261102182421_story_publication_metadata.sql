alter table public.stories
  add column if not exists fandom text not null default '' check (char_length(fandom) <= 200),
  add column if not exists work_has_ai boolean not null default false,
  add column if not exists cover_has_ai boolean not null default false,
  add column if not exists has_content_warnings boolean not null default false,
  add column if not exists content_warnings text not null default '' check (char_length(content_warnings) <= 2000),
  add column if not exists accepts_translation boolean not null default false;
