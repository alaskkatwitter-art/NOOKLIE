-- Atomic chapter ordering and permanent deletion, callable only by the server service role.
create or replace function public.nooklie_reorder_chapters(p_story uuid,p_ids uuid[])
returns void language plpgsql security invoker set search_path=public as $$
declare n integer; maxnum integer;
begin
 perform 1 from stories where id=p_story for update;
 select count(*),coalesce(max(chapter_number),0) into n,maxnum from chapters where story_id=p_story;
 if p_ids is null or cardinality(p_ids)<>n or (select count(distinct x) from unnest(p_ids) x)<>n or exists(select 1 from unnest(p_ids) x where not exists(select 1 from chapters where id=x and story_id=p_story)) then
 raise exception 'Invalid chapter order' using errcode='22023';
 end if;
 update chapters set chapter_number=chapter_number+maxnum+n+1 where story_id=p_story;
 update chapters c set chapter_number=o.ordinality::integer from unnest(p_ids) with ordinality o(id,ordinality) where c.id=o.id and c.story_id=p_story;
end $$;
revoke all on function public.nooklie_reorder_chapters(uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.nooklie_reorder_chapters(uuid,uuid[]) to service_role;

create or replace function public.nooklie_delete_chapter(p_story uuid,p_chapter uuid)
returns boolean language plpgsql security invoker set search_path=public as $$
declare ids uuid[]; n integer; maxnum integer;
begin
 perform 1 from stories where id=p_story for update;
 if not exists(select 1 from chapters where story_id=p_story and id=p_chapter) then return false; end if;
 delete from chapters where story_id=p_story and id=p_chapter;
 select array_agg(id order by chapter_number,id),count(*),coalesce(max(chapter_number),0) into ids,n,maxnum from chapters where story_id=p_story;
 if n>0 then
 update chapters set chapter_number=chapter_number+maxnum+n+1 where story_id=p_story;
 update chapters c set chapter_number=o.ordinality::integer from unnest(ids) with ordinality o(id,ordinality) where c.id=o.id and c.story_id=p_story;
 end if;
 return true;
end $$;
revoke all on function public.nooklie_delete_chapter(uuid,uuid) from public,anon,authenticated;
grant execute on function public.nooklie_delete_chapter(uuid,uuid) to service_role;
