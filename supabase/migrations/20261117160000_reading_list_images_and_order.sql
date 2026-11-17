alter table public.reading_lists add column image_path text;
alter table public.reading_list_items add column position integer;

-- Existing lists keep the same newest-first presentation until their owner changes it.
with positions as (
  select id, row_number() over (partition by list_id order by added_at desc, id) - 1 as position
  from public.reading_list_items
)
update public.reading_list_items item set position = positions.position
from positions where item.id = positions.id;

alter table public.reading_list_items alter column position set not null;
alter table public.reading_list_items add constraint reading_list_position_nonnegative check(position >= 0);
create index reading_list_item_order_idx on public.reading_list_items(list_id, position, added_at desc, id);

-- Serialize additions, removal and sorting on the same list.
create function public.append_reading_list_item() returns trigger
language plpgsql set search_path = public as $$
begin
  perform 1 from reading_lists where id = new.list_id for update;
  select coalesce(max(position), -1) + 1 into new.position from reading_list_items where list_id = new.list_id;
  return new;
end;
$$;
create trigger append_reading_list_item before insert on public.reading_list_items
for each row execute function public.append_reading_list_item();

create function public.reorder_reading_list(p_owner uuid, p_list uuid, p_stories uuid[])
returns boolean language plpgsql set search_path = public as $$
declare list uuid; total integer;
begin
  select id into list from reading_lists
    where id = p_list and user_id = p_owner and name <> 'Biblioteca' for update;
  if list is null then return false; end if;
  select count(*) into total from reading_list_items where list_id = p_list;
  if p_stories is null or cardinality(p_stories) <> total
    or (select count(distinct story) from unnest(p_stories) story) <> total
    or exists(select 1 from unnest(p_stories) story where not exists(
      select 1 from reading_list_items where list_id = p_list and story_id = story
    )) then
    raise exception 'List changed; reload before sorting' using errcode = '22023';
  end if;
  update reading_list_items item set position = ordering.ordinality::integer - 1
  from unnest(p_stories) with ordinality ordering(story_id, ordinality)
  where item.list_id = p_list and item.story_id = ordering.story_id;
  return true;
end;
$$;
revoke all on function public.reorder_reading_list(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.reorder_reading_list(uuid, uuid, uuid[]) to service_role;

create function public.remove_reading_list_item(p_owner uuid, p_list uuid, p_story uuid)
returns boolean language plpgsql set search_path = public as $$
declare list uuid;
begin
  select id into list from reading_lists
    where id = p_list and user_id = p_owner and name <> 'Biblioteca' for update;
  if list is null then return false; end if;
  delete from reading_list_items where list_id = p_list and story_id = p_story;
  return true;
end;
$$;
revoke all on function public.remove_reading_list_item(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_reading_list_item(uuid, uuid, uuid) to service_role;
