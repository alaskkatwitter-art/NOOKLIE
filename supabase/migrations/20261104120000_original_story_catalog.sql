alter table public.stories
  add column story_kind text not null default '' check (story_kind in ('', 'original', 'fanfic')),
  add column story_format text not null default '' check (story_format in ('', 'romance', 'novela', 'conto', 'coletanea', 'poesia'));

create or replace function public.search_catalog_stories(
 p_viewer uuid default null,
 p_query text default null,p_include_slugs text[] default '{}',p_exclude_slugs text[] default '{}',p_rating text default null,p_status text default null,p_sort text default 'updated',p_limit integer default 24,p_offset integer default 0, p_kind text default null, p_format text default null
) returns table(id uuid,author_id uuid,title text,description text,cover_url text,status text,rating text,created_at timestamptz,updated_at timestamptz,story_kind text,story_format text)
language sql stable security invoker set search_path=pg_catalog as $$
with searchable as (
 select s.*, debut.first_published_at,public.discovery_key(s.title) title_key,
 public.discovery_key(concat_ws(' ',s.title,s.description,s.fandom,p.username,p.display_name,
 (select string_agg(t.name,' ') from public.story_tags st join public.tags t on t.id=st.tag_id where st.story_id=s.id))) document_key,
 public.discovery_story_fandoms(s.id,s.fandom) fandom_keys
 from public.stories s join public.profiles p on p.id=s.author_id left join public.auth_accounts a on a.id=p.user_id
 join lateral (select min(coalesce(c.original_published_at,c.created_at)) first_published_at from public.chapters c where c.story_id=s.id and c.published=true) debut on debut.first_published_at is not null
 where public.profile_content_allowed(s.author_id,p_viewer) and s.moderation_hidden_at is null and p.moderation_hidden_at is null and a.account_status is distinct from 'suspended'
 and (p_kind is null or s.story_kind=p_kind) and (p_format is null or s.story_format=p_format)
)
select s.id,s.author_id,s.title,s.description,s.cover_url,s.status,s.rating,s.created_at,s.updated_at,s.story_kind,s.story_format from searchable s
where (public.discovery_key(p_query)='' or not exists(select 1 from unnest(string_to_array(public.discovery_key(p_query),'-')) word where position(word in s.document_key)=0))
and (p_rating is null or s.rating=p_rating) and (p_status is null or s.status=p_status)
and not exists(select 1 from unnest(coalesce(p_include_slugs,'{}'::text[])) required where not (required=any(s.fandom_keys)) and not exists(select 1 from public.story_tags st join public.tags t on t.id=st.tag_id where st.story_id=s.id and t.slug=required))
and not exists(select 1 from unnest(coalesce(p_exclude_slugs,'{}'::text[])) excluded where excluded=any(s.fandom_keys) or exists(select 1 from public.story_tags st join public.tags t on t.id=st.tag_id where st.story_id=s.id and t.slug=excluded))
order by case when public.discovery_key(p_query)<>'' then case when s.title_key=public.discovery_key(p_query) then 0 when s.title_key like public.discovery_key(p_query)||'%' then 1 when position(public.discovery_key(p_query) in s.title_key)>0 then 2 else 3 end end,
case when p_sort='debut' then s.first_published_at end desc,
case when p_sort='newest' then s.created_at end desc,
case when p_sort='title_asc' then s.title end asc,case when p_sort='title_desc' then s.title end desc,s.updated_at desc,s.id
limit least(greatest(coalesce(p_limit,24),1),48) offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.search_catalog_stories(uuid,text,text[],text[],text,text,text,integer,integer,text,text) from public,anon,authenticated;grant execute on function public.search_catalog_stories(uuid,text,text[],text[],text,text,text,integer,integer,text,text) to service_role;


alter table public.chapters
  add column entry_kind text not null default 'chapter'
  check (entry_kind in ('chapter', 'prologue', 'epilogue', 'extra'));

alter table public.profiles
  add column pinned_story_id uuid references public.stories(id) on delete set null;

create function public.pin_profile_story(p_profile uuid, p_story uuid)
returns boolean language sql volatile security invoker set search_path = pg_catalog as $$
  with updated as (
    update public.profiles p set pinned_story_id = p_story
    where p.id = p_profile and p.moderation_hidden_at is null
      and (p_story is null or exists (
        select 1 from public.stories s
        where s.id = p_story and s.author_id = p.id and s.moderation_hidden_at is null
          and exists (select 1 from public.chapters c where c.story_id = s.id and c.published)
      ))
    returning p.id
  )
  select exists (select 1 from updated);
$$;
revoke all on function public.pin_profile_story(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pin_profile_story(uuid, uuid) to service_role;

alter table public.stories
  add column series_name text not null default '' check (char_length(series_name) <= 100),
  add column series_volume integer check (series_volume between 1 and 999),
  add constraint story_series_requires_volume check (
    (series_name = '' and series_volume is null)
    or (story_kind = 'original' and series_name <> '' and series_volume is not null)
  );

create unique index stories_series_volume_key
  on public.stories (author_id, lower(series_name), series_volume)
  where series_volume is not null;

create function public.list_story_series(p_story uuid, p_viewer uuid)
returns table(id uuid, title text, series_volume integer)
language sql stable security invoker set search_path = pg_catalog as $$
  select sibling.id, sibling.title, sibling.series_volume
  from public.stories source
  join public.stories sibling on sibling.author_id = source.author_id
    and lower(sibling.series_name) = lower(source.series_name)
    and sibling.series_volume is not null
  join public.profiles author on author.id = source.author_id
  left join public.auth_accounts account on account.id = author.user_id
  where source.id = p_story and source.series_volume is not null
    and source.moderation_hidden_at is null and sibling.moderation_hidden_at is null
    and author.moderation_hidden_at is null and account.account_status is distinct from 'suspended'
    and public.profile_content_allowed(author.id, p_viewer)
    and exists (select 1 from public.chapters c where c.story_id = source.id and c.published)
    and exists (select 1 from public.chapters c where c.story_id = sibling.id and c.published)
  order by sibling.series_volume;
$$;
revoke all on function public.list_story_series(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_story_series(uuid, uuid) to service_role;

create table public.beta_reading_invites (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references public.chapters(id) on delete cascade,
  reader_id uuid not null references public.profiles(id) on delete cascade,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (chapter_id, reader_id)
);
alter table public.beta_reading_invites enable row level security;
revoke all on public.beta_reading_invites from public, anon, authenticated;
grant select, insert, update, delete on public.beta_reading_invites to service_role;
create index beta_reading_reader_idx on public.beta_reading_invites(reader_id, created_at desc);

create table public.beta_reading_notes (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.beta_reading_invites(id) on delete cascade,
  excerpt text not null default '' check (char_length(excerpt) <= 400),
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.beta_reading_notes enable row level security;
revoke all on public.beta_reading_notes from public, anon, authenticated;
grant select, insert on public.beta_reading_notes to service_role;
create index beta_reading_notes_invite_idx on public.beta_reading_notes(invite_id, created_at desc);

create function public.beta_reading_action(
  p_actor uuid, p_action text, p_invite uuid default null, p_chapter uuid default null,
  p_reader text default null, p_excerpt text default '', p_body text default ''
) returns jsonb language plpgsql volatile security invoker set search_path = pg_catalog as $$
declare access record; target uuid; new_invite uuid;
begin
  if p_action = 'list' then
    return (select coalesce(jsonb_agg(to_jsonb(item)), '[]'::jsonb) from (
      select i.id, i.accepted_at, c.title, s.title story_title,
        author.username author_name, reader.username reader_name, (s.author_id = p_actor) owner
      from public.beta_reading_invites i
      join public.chapters c on c.id = i.chapter_id
      join public.stories s on s.id = c.story_id
      join public.profiles author on author.id = s.author_id
      join public.profiles reader on reader.id = i.reader_id
      where (i.reader_id = p_actor or s.author_id = p_actor)
        and s.moderation_hidden_at is null and not c.published
        and not exists (select 1 from public.chat_blocks b where
          (b.blocker_id = s.author_id and b.blocked_id = i.reader_id)
          or (b.blocker_id = i.reader_id and b.blocked_id = s.author_id))
      order by i.created_at desc, i.id limit 100
    ) item);
  elsif p_action = 'invite' then
    select r.id into target from public.profiles r
    join public.auth_accounts a on a.id = r.user_id
    where lower(r.username) = lower(p_reader) and r.id <> p_actor and r.moderation_hidden_at is null
      and a.account_status is distinct from 'suspended';
    if target is null then return null; end if;
    if not exists (
      select 1 from public.chapters c join public.stories s on s.id = c.story_id
      where c.id = p_chapter and s.author_id = p_actor and not c.published
        and s.story_kind = 'original' and s.moderation_hidden_at is null
        and not exists (select 1 from public.chat_blocks b where
          (b.blocker_id = p_actor and b.blocked_id = target)
          or (b.blocker_id = target and b.blocked_id = p_actor))
    ) then return null; end if;
    insert into public.beta_reading_invites(chapter_id, reader_id) values (p_chapter, target)
      on conflict (chapter_id, reader_id) do nothing returning id into new_invite;
    if new_invite is not null then
      perform public.social_notify(target, p_actor, 'beta_reading_invite', 'convidou você para uma leitura beta.', '/leitura-beta', 'beta-invite:' || new_invite);
    end if;
    return 'true'::jsonb;
  end if;

  select i.reader_id, i.accepted_at, c.title, c.body, c.published, s.author_id,
    s.title story_title, s.story_kind into access
  from public.beta_reading_invites i
  join public.chapters c on c.id = i.chapter_id
  join public.stories s on s.id = c.story_id
  join public.profiles author on author.id = s.author_id
  join public.auth_accounts a on a.id = author.user_id
  where i.id = p_invite and (i.reader_id = p_actor or s.author_id = p_actor)
    and s.moderation_hidden_at is null and author.moderation_hidden_at is null
    and a.account_status is distinct from 'suspended'
    and (p_action = 'revoke' or not exists (select 1 from public.chat_blocks b where
      (b.blocker_id = s.author_id and b.blocked_id = i.reader_id)
      or (b.blocker_id = i.reader_id and b.blocked_id = s.author_id)))
  for update of i;
  if not found then return null; end if;

  if p_action = 'revoke' then
    delete from public.beta_reading_invites where id = p_invite;
    return 'true'::jsonb;
  end if;
  if access.published or access.story_kind <> 'original' then return null; end if;
  if p_action = 'accept' and access.reader_id = p_actor then
    update public.beta_reading_invites set accepted_at = coalesce(accepted_at, now()) where id = p_invite;
    return 'true'::jsonb;
  end if;
  if access.author_id <> p_actor and access.accepted_at is null then return null; end if;
  if p_action = 'read' then
    return jsonb_build_object(
      'title', access.title, 'story_title', access.story_title, 'body', access.body,
      'owner', access.author_id = p_actor, 'accepted', access.accepted_at is not null,
      'notes', (select coalesce(jsonb_agg(to_jsonb(note)), '[]'::jsonb) from (
        select id, excerpt, body, created_at from public.beta_reading_notes
        where invite_id = p_invite order by created_at desc, id limit 100
      ) note)
    );
  elsif p_action = 'note' and access.reader_id = p_actor and access.accepted_at is not null then
    insert into public.beta_reading_notes(invite_id, excerpt, body) values (p_invite, p_excerpt, p_body);
    return 'true'::jsonb;
  end if;
  return null;
end;
$$;
revoke all on function public.beta_reading_action(uuid,text,uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.beta_reading_action(uuid,text,uuid,uuid,text,text,text) to service_role;
