alter table public.story_events
  add column details jsonb,
  add column revision uuid not null default gen_random_uuid();

alter table public.story_events
  drop constraint story_events_description_check,
  add constraint story_events_description_check
    check (char_length(description) <= 12000),
  add constraint story_events_details_check
    check (details is null or jsonb_typeof(details) = 'object');
