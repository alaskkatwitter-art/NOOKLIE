-- Custom application sessions are checked by the Next.js API. Browser roles have no access.
create table public.discovery_preferences (
  user_id uuid primary key references public.auth_accounts(id) on delete cascade,
  favorite_fandoms text[] not null default '{}',
  updated_at timestamptz not null default now(),
  check (cardinality(favorite_fandoms) <= 30),
  check (char_length(array_to_string(favorite_fandoms, ',')) <= 3000)
);
create table public.story_daily_engagement (
  story_id uuid not null references public.stories(id) on delete cascade,
  reader_id uuid not null references public.profiles(id) on delete cascade,
  activity_day date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  viewed boolean not null default false,
  read boolean not null default false,
  primary key (story_id, reader_id, activity_day)
);
create index story_daily_reader_idx on public.story_daily_engagement(reader_id);
create index story_daily_day_idx on public.story_daily_engagement(activity_day, story_id);
create index if not exists reading_progress_recent_idx on public.reading_progress(user_id, updated_at desc);
create table public.story_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default true,
  created_by uuid not null references public.auth_accounts(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index story_events_creator_idx on public.story_events(created_by);
create table public.story_event_entries (
  event_id uuid not null references public.story_events(id) on delete cascade,
  story_id uuid not null references public.stories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, story_id)
);
create index story_event_story_idx on public.story_event_entries(story_id);
alter table public.discovery_preferences enable row level security;
alter table public.story_daily_engagement enable row level security;
alter table public.story_events enable row level security;
alter table public.story_event_entries enable row level security;
revoke all on public.discovery_preferences, public.story_daily_engagement, public.story_events, public.story_event_entries from public, anon, authenticated;
grant all on public.discovery_preferences, public.story_daily_engagement, public.story_events, public.story_event_entries to service_role;

create or replace function public.discovery_key(value text) returns text
language sql immutable parallel safe security invoker set search_path=pg_catalog as $$
 select trim(both '-' from regexp_replace(translate(lower(coalesce(value,'')), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'), '[^a-z0-9]+', '-', 'g'));
$$;
revoke all on function public.discovery_key(text) from public, anon, authenticated;
grant execute on function public.discovery_key(text) to service_role;

create or replace function public.discovery_story_fandoms(p_story uuid, p_fandom text) returns text[]
language sql stable security invoker set search_path=pg_catalog as $$
 select coalesce(array_agg(distinct v) filter(where v<>''), array['universo-original']) from (
   select public.discovery_key(part) v from regexp_split_to_table(nullif(p_fandom,''), ',') part
   union all select t.slug from public.story_tags st join public.tags t on t.id=st.tag_id
   join public.tag_categories tc on tc.id=t.category_id where st.story_id=p_story and tc.slug='fandom'
 ) valueset;
$$;
revoke all on function public.discovery_story_fandoms(uuid,text) from public, anon, authenticated;
grant execute on function public.discovery_story_fandoms(uuid,text) to service_role;

-- Atomic progress + engagement. A reload cannot add another access/read for this reader/day.
create or replace function public.record_discovery_activity(p_account uuid, p_story uuid, p_chapter uuid default null, p_percent numeric default 0, p_position integer default 0, p_read boolean default false)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare reader uuid; author uuid;
begin
 select p.id into reader from public.profiles p join public.auth_accounts a on a.id=p.user_id
 where p.user_id=p_account and p.moderation_hidden_at is null and a.account_status is distinct from 'suspended';
 select s.author_id into author from public.stories s join public.profiles p on p.id=s.author_id
 left join public.auth_accounts a on a.id=p.user_id
 where s.id=p_story and s.moderation_hidden_at is null and p.moderation_hidden_at is null
 and a.account_status is distinct from 'suspended' and exists(select 1 from public.chapters c where c.story_id=s.id and c.published=true);
 if reader is null or author is null then return false; end if;
 if p_percent is null or p_percent<0 or p_percent>100 or p_position is null or p_position<0 or p_position>10000 then return false; end if;
 if p_chapter is not null then
   if not exists(select 1 from public.chapters c where c.id=p_chapter and c.story_id=p_story and c.published=true) then return false; end if;
   insert into public.reading_progress(user_id,story_id,chapter_id,progress_percent,position,updated_at)
   values(reader,p_story,p_chapter,p_percent,p_position,now())
   on conflict(user_id,story_id) do update set chapter_id=excluded.chapter_id,progress_percent=excluded.progress_percent,position=excluded.position,updated_at=excluded.updated_at;
 end if;
 if reader<>author then
   insert into public.story_daily_engagement(story_id,reader_id,viewed,read)
   values(p_story,reader,true,p_read and p_chapter is not null)
   on conflict(story_id,reader_id,activity_day) do update set viewed=true,read=public.story_daily_engagement.read or excluded.read;
 end if;
 return true;
end;
$$;
revoke all on function public.record_discovery_activity(uuid,uuid,uuid,numeric,integer,boolean) from public,anon,authenticated;
grant execute on function public.record_discovery_activity(uuid,uuid,uuid,numeric,integer,boolean) to service_role;

create or replace function public.discovery_home(p_account uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$
with favorites as (
 select coalesce((select favorite_fandoms from public.discovery_preferences where user_id=p_account),'{}'::text[]) names
), reader as (select id from public.profiles where user_id=p_account),
metrics as (
 select story_id, count(*) filter(where viewed) views, count(*) filter(where read) reads,
 count(*) filter(where activity_day>=(now() at time zone 'America/Sao_Paulo')::date-6 and viewed) week_views,
 count(*) filter(where activity_day>=(now() at time zone 'America/Sao_Paulo')::date-6 and read) week_reads
 from public.story_daily_engagement group by story_id
), eligible as materialized (
 select s.id,s.author_id,s.title,left(s.description,240) description,s.cover_url,s.fandom,s.rating,s.work_has_ai,s.cover_has_ai,s.has_content_warnings,s.content_warnings,
 s.created_at,s.updated_at,p.username,p.display_name,pc.first_published_at,
 public.discovery_story_fandoms(s.id,s.fandom) fandom_keys,
 coalesce((select array_agg(t.slug) from public.story_tags st join public.tags t on t.id=st.tag_id join public.tag_categories tc on tc.id=t.category_id where st.story_id=s.id and tc.slug='genre'),'{}'::text[]) genres,
 coalesce(m.views,0) views,coalesce(m.reads,0) reads,coalesce(m.week_views,0) week_views,coalesce(m.week_reads,0) week_reads
 from public.stories s join public.profiles p on p.id=s.author_id
 left join public.auth_accounts a on a.id=p.user_id
 join lateral(select min(coalesce(c.original_published_at,c.created_at)) first_published_at from public.chapters c where c.story_id=s.id and c.published=true) pc on pc.first_published_at is not null
 left join metrics m on m.story_id=s.id
 where s.moderation_hidden_at is null and p.moderation_hidden_at is null and a.account_status is distinct from 'suspended'
), candidates as materialized (
 select e.*,to_jsonb(e)-'genres'-'fandom_keys' card from eligible e cross join favorites f
 where cardinality(f.names)=0 or e.fandom_keys && array(select public.discovery_key(n) from unnest(f.names) n)
), genre_affinity as (
 select t.slug,count(*) weight from public.reading_progress rp join reader r on r.id=rp.user_id
 join public.story_tags st on st.story_id=rp.story_id join public.tags t on t.id=st.tag_id
 join public.tag_categories tc on tc.id=t.category_id where tc.slug='genre' group by t.slug order by weight desc,t.slug limit 5
), continue_reading as (
 select e.id,e.title,e.cover_url,c.id chapter_id,c.title chapter_title,c.chapter_number,rp.progress_percent,rp.position,rp.updated_at
 from public.reading_progress rp join reader r on r.id=rp.user_id join eligible e on e.id=rp.story_id
 join public.chapters c on c.id=rp.chapter_id and c.story_id=rp.story_id and c.published=true
 order by rp.updated_at desc limit 6
), event_rows as (
 select ev.id,ev.title,ev.description,ev.ends_at,
 coalesce((select jsonb_agg(x.card) from (select c.card from candidates c join public.story_event_entries en on en.story_id=c.id where en.event_id=ev.id order by en.created_at desc,c.id limit 8)x),'[]'::jsonb) stories
 from public.story_events ev where ev.active and ev.starts_at<=now() and ev.ends_at>now() order by ev.ends_at limit 4
)
select jsonb_build_object(
 'favorite_fandoms',(select to_jsonb(names) from favorites),
 'continue_reading',coalesce((select jsonb_agg(to_jsonb(x)) from continue_reading x),'[]'::jsonb),
 'genres',coalesce((select jsonb_agg(slug order by weight desc,slug) from genre_affinity),'[]'::jsonb),
 'for_you',coalesce((select jsonb_agg(x.card) from (select c.card from candidates c where c.genres && array(select slug from genre_affinity) order by c.week_reads desc,c.first_published_at desc,c.id limit 8)x),'[]'::jsonb),
 'weekly',coalesce((select jsonb_agg(x.card) from (select card from candidates where week_views+week_reads>0 order by (week_views+week_reads*3) desc,first_published_at desc,id limit 8)x),'[]'::jsonb),
 'most_viewed',coalesce((select jsonb_agg(x.card) from (select card from candidates where views>0 order by views desc,reads desc,id limit 8)x),'[]'::jsonb),
 'most_read',coalesce((select jsonb_agg(x.card) from (select card from candidates where reads>0 order by reads desc,views desc,id limit 8)x),'[]'::jsonb),
 'new_fandom',coalesce((select jsonb_agg(x.card) from (select c.card from candidates c order by c.first_published_at desc,c.id limit 8)x),'[]'::jsonb),
 'new_voices',coalesce((select jsonb_agg(x.card) from (select card from (select c.*,row_number() over(partition by author_id order by first_published_at desc,id) author_slot from candidates c where reads<10) diverse where author_slot<=2 order by first_published_at desc,id limit 8)x),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(x)) from event_rows x),'[]'::jsonb)
);
$$;
revoke all on function public.discovery_home(uuid) from public,anon,authenticated;
grant execute on function public.discovery_home(uuid) to service_role;

-- Preserve the Explore contract; search every public work before pagination.
create or replace function public.search_public_stories(
 p_query text default null,p_include_slugs text[] default '{}',p_exclude_slugs text[] default '{}',p_rating text default null,p_status text default null,p_sort text default 'updated',p_limit integer default 24,p_offset integer default 0
) returns table(id uuid,author_id uuid,title text,description text,cover_url text,status text,rating text,created_at timestamptz,updated_at timestamptz)
language sql stable security invoker set search_path=pg_catalog as $$
with searchable as (
 select s.*,public.discovery_key(s.title) title_key,
 public.discovery_key(concat_ws(' ',s.title,s.description,s.fandom,p.username,p.display_name,
 (select string_agg(t.name,' ') from public.story_tags st join public.tags t on t.id=st.tag_id where st.story_id=s.id))) document_key,
 public.discovery_story_fandoms(s.id,s.fandom) fandom_keys
 from public.stories s join public.profiles p on p.id=s.author_id left join public.auth_accounts a on a.id=p.user_id
 where s.moderation_hidden_at is null and p.moderation_hidden_at is null and a.account_status is distinct from 'suspended'
 and exists(select 1 from public.chapters c where c.story_id=s.id and c.published=true)
)
select s.id,s.author_id,s.title,s.description,s.cover_url,s.status,s.rating,s.created_at,s.updated_at from searchable s
where (public.discovery_key(p_query)='' or not exists(select 1 from unnest(string_to_array(public.discovery_key(p_query),'-')) word where position(word in s.document_key)=0))
and (p_rating is null or s.rating=p_rating) and (p_status is null or s.status=p_status)
and not exists(select 1 from unnest(coalesce(p_include_slugs,'{}'::text[])) required where not (required=any(s.fandom_keys)) and not exists(select 1 from public.story_tags st join public.tags t on t.id=st.tag_id where st.story_id=s.id and t.slug=required))
and not exists(select 1 from unnest(coalesce(p_exclude_slugs,'{}'::text[])) excluded where excluded=any(s.fandom_keys) or exists(select 1 from public.story_tags st join public.tags t on t.id=st.tag_id where st.story_id=s.id and t.slug=excluded))
order by case when public.discovery_key(p_query)<>'' then case when s.title_key=public.discovery_key(p_query) then 0 when s.title_key like public.discovery_key(p_query)||'%' then 1 when position(public.discovery_key(p_query) in s.title_key)>0 then 2 else 3 end end,
case when p_sort='newest' then s.created_at end desc,
case when p_sort='title_asc' then s.title end asc,case when p_sort='title_desc' then s.title end desc,s.updated_at desc,s.id
limit least(greatest(coalesce(p_limit,24),1),48) offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.search_public_stories(text,text[],text[],text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.search_public_stories(text,text[],text[],text,text,text,integer,integer) to service_role;

create or replace function public.discovery_fandom_catalog() returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$
with names as (
 select 'Universo original' name
 union all select btrim(part) from public.stories s cross join lateral regexp_split_to_table(s.fandom, ',') part
 where s.moderation_hidden_at is null and btrim(part)<>'' and exists(select 1 from public.chapters c where c.story_id=s.id and c.published=true)
 union all select t.name from public.tags t join public.tag_categories tc on tc.id=t.category_id where tc.slug='fandom'
), unique_names as(select min(name) name from names where char_length(name)<=100 group by public.discovery_key(name))
select coalesce(jsonb_agg(name order by name),'[]'::jsonb) from (select name from unique_names order by name limit 300) n;
$$;
revoke all on function public.discovery_fandom_catalog() from public,anon,authenticated;
grant execute on function public.discovery_fandom_catalog() to service_role;

create or replace function public.discovery_sitemap() returns table(id uuid,updated_at timestamptz)
language sql stable security invoker set search_path=pg_catalog as $$
select s.id,s.updated_at from public.stories s join public.profiles p on p.id=s.author_id left join public.auth_accounts a on a.id=p.user_id
where s.moderation_hidden_at is null and p.moderation_hidden_at is null and a.account_status is distinct from 'suspended'
and exists(select 1 from public.chapters c where c.story_id=s.id and c.published=true)
order by s.id limit 50000;
$$;
revoke all on function public.discovery_sitemap() from public,anon,authenticated;
grant execute on function public.discovery_sitemap() to service_role;
