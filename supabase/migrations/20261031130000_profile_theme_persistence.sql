-- Keep profile theme persistence reproducible on fresh and existing databases.
-- The UI accepts a fixed palette and stores the selected hex value per profile.
alter table public.profiles
  add column if not exists theme_color text;

alter table public.profiles
  alter column theme_color set default '#ff78b9';
