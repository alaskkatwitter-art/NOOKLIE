begin;
alter table public.profiles add column if not exists reposts_private boolean not null default false;
alter table public.chapters add column if not exists banner_url text;
alter table public.user_notifications add column if not exists actor_id uuid references public.profiles(id) on delete set null;
create index if not exists user_notifications_actor_idx on public.user_notifications(actor_id);
create table if not exists public.nook_reposts (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 post_id uuid not null references public.nook_posts(id) on delete cascade,
 comment text check (comment is null or (length(btrim(comment)) between 1 and 5000)),
 created_at timestamptz not null default now(),
 unique(user_id,post_id)
);
create index if not exists nook_reposts_post_idx on public.nook_reposts(post_id,created_at desc);
create index if not exists nook_reposts_timeline_idx on public.nook_reposts(created_at desc);
alter table public.nook_reposts enable row level security;
-- Nooklie authenticates its own sessions on the server. Never expose these rows via anon/JWT.
revoke all on public.nook_reposts from public,anon,authenticated;
grant select,insert,update,delete on public.nook_reposts to service_role;
create or replace function public.social_notify(p_target uuid,p_actor uuid,p_kind text,p_body text,p_href text,p_key text)
returns void language sql set search_path=pg_catalog as $$
 insert into public.user_notifications(user_id,notification_type,title,body,href,source_key,actor_id)
 select target.user_id,p_kind,coalesce(actor.display_name,actor.username,'Alguém')||' '||p_body,'',p_href,p_key,p_actor
 from public.profiles target left join public.profiles actor on actor.id=p_actor
 where target.id=p_target and target.id is distinct from p_actor and target.social_notifications
 and not exists(select 1 from public.profile_mutes m where m.user_id=p_target and m.target_id=p_actor)
 and not exists(select 1 from public.chat_blocks b where (b.blocker_id=p_target and b.blocked_id=p_actor)or(b.blocker_id=p_actor and b.blocked_id=p_target))
 on conflict(user_id,source_key) do nothing;
$$;
create or replace function public.nook_repost_notification() returns trigger language plpgsql set search_path=pg_catalog as $$
declare target uuid;begin
 select user_id into target from public.nook_posts where id=new.post_id;
 perform public.social_notify(target,new.user_id,'nook_repost',case when new.comment is null then 'nooklou seu post.' else 'nooklou seu post com um comentário.' end,'/feed?post='||new.post_id,'nook-repost:'||new.id);
 return new;
end;$$;
revoke all on function public.nook_repost_notification() from public,anon,authenticated;
create trigger nook_repost_notification after insert on public.nook_reposts for each row execute function public.nook_repost_notification();
-- Associate existing social notifications without inventing an actor.
update public.user_notifications n set actor_id=p.id,title=coalesce(p.display_name,p.username)||substring(n.body from length(p.username)+2),body=''
from public.profiles p where n.actor_id is null and n.title='Nova interação no Nooklie' and left(n.body,length(p.username)+2)='@'||p.username||' ';

-- One transaction locks each due schedule, publishes it once and removes it.
create or replace function public.publish_scheduled_chapters() returns integer
language plpgsql set search_path=pg_catalog as $$
declare item record; released integer:=0;begin
 for item in select sc.id,sc.chapter_id,sc.scheduled_for from public.scheduled_chapters sc
 join public.chapters c on c.id=sc.chapter_id where sc.scheduled_for<=now() and c.publication_status='scheduled'
 order by sc.scheduled_for for update of sc,c skip locked
 loop
  update public.chapters set published=true,publication_status='published',original_published_at=coalesce(original_published_at,item.scheduled_for),updated_at=now() where id=item.chapter_id and publication_status='scheduled';
  if found then released:=released+1;end if;
  delete from public.scheduled_chapters where id=item.id;
 end loop;
 return released;
end;$$;
revoke all on function public.publish_scheduled_chapters() from public,anon,authenticated;
grant execute on function public.publish_scheduled_chapters() to service_role;
create extension if not exists pg_cron;
select cron.schedule('nooklie-release-chapters','* * * * *','select public.publish_scheduled_chapters()');
create or replace function public.social_interaction_notification()returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid;target uuid;other uuid;story uuid;chapter uuid;post uuid;href text;phrase text;begin
if tg_table_name='follows' then actor:=new.follower_id;target:=new.following_id;phrase:='começou a seguir você.';href:='/perfil/'||(select username from public.profiles where id=actor);
elsif tg_table_name='follow_requests' then actor:=new.requester_id;target:=new.target_id;phrase:='pediu para seguir seu perfil privado.';href:='/solicitacoes';
elsif tg_table_name in('chapter_likes','chapter_favorites')then actor:=new.user_id;chapter:=new.chapter_id;select s.author_id into target from public.chapters c join public.stories s on s.id=c.story_id where c.id=chapter;phrase:=case when tg_table_name='chapter_favorites'then'favoritou um capítulo seu.'else'curtiu um capítulo seu.'end;href:='/capitulo/'||chapter;
elsif tg_table_name='story_likes' then actor:=new.user_id;select author_id into target from public.stories where id=new.story_id;phrase:='curtiu sua história.';href:='/historia/'||new.story_id;
elsif tg_table_name='comments' then actor:=new.user_id;chapter:=new.chapter_id;select s.author_id into target from public.chapters c join public.stories s on s.id=c.story_id where c.id=chapter;phrase:='comentou em um capítulo seu.';href:='/capitulo/'||chapter;if new.parent_comment_id is not null then select user_id into other from public.comments where id=new.parent_comment_id;end if;
elsif tg_table_name='comment_likes' then actor:=new.user_id;select user_id,chapter_id into target,chapter from public.comments where id=new.comment_id;phrase:='curtiu seu comentário “'||coalesce((select left(body,100) from public.comments where id=new.comment_id),'')||'”.';href:='/capitulo/'||chapter;
elsif tg_table_name='nook_comments' then actor:=new.author_id;post:=new.post_id;select user_id into target from public.nook_posts where id=post;phrase:='comentou em sua publicação.';href:='/feed?post='||post;if new.parent_id is not null then select author_id into other from public.nook_comments where id=new.parent_id;end if;
elsif tg_table_name='nook_comment_reactions' then actor:=new.user_id;select author_id,post_id into target,post from public.nook_comments where id=new.comment_id;phrase:='reagiu ao seu comentário no mural.';href:='/feed?post='||post;
elsif tg_table_name='nook_post_reactions' then actor:=new.user_id;select user_id into target from public.nook_posts where id=new.post_id;phrase:='curtiu sua publicação.';href:='/feed?post='||new.post_id;
elsif tg_table_name='nook_saved_posts' then actor:=new.user_id;select user_id into target from public.nook_posts where id=new.post_id;phrase:='salvou sua publicação.';href:='/feed?post='||new.post_id;
elsif tg_table_name='reading_list_items' then select user_id into actor from public.reading_lists where id=new.list_id;select author_id into target from public.stories where id=new.story_id;if not exists(select 1 from public.reading_lists where id=new.list_id and is_public)then return new;end if;phrase:='adicionou sua história na lista de leitura pública: '||(select name from public.reading_lists where id=new.list_id)||'.';href:='/historia/'||new.story_id;
elsif tg_table_name='nook_posts' then actor:=new.user_id;if new.story_id is null then return new;end if;select author_id into target from public.stories where id=new.story_id;phrase:='vinculou sua história a uma publicação no mural.';href:='/feed?post='||new.id;
elsif tg_table_name='posts' then actor:=new.user_id;select s.author_id into target from public.chapters c join public.stories s on s.id=c.story_id where c.id=new.chapter_id;phrase:='citou um trecho do seu capítulo no perfil.';href:='/capitulo/'||new.chapter_id;
elsif tg_table_name='post_likes' then actor:=new.user_id;select user_id into target from public.posts where id=new.post_id;phrase:='curtiu sua publicação.';href:='/perfil/'||(select username from public.profiles where id=target);
else return new;end if;
perform public.social_notify(target,actor,tg_table_name,phrase,href,tg_table_name||':'||coalesce(to_jsonb(new)->>'id',md5(to_jsonb(new)::text))||':'||target);
if other is not null and other is distinct from target then perform public.social_notify(other,actor,'reply','respondeu ao seu comentário.',href,tg_table_name||':'||coalesce(to_jsonb(new)->>'id',md5(to_jsonb(new)::text))||':'||other);end if;
return new;end;$$;


create or replace function public.set_chapter_publication(p_session text,p_chapter uuid,p_status text,p_scheduled_for timestamptz default null) returns jsonb
language plpgsql set search_path=pg_catalog as $$
declare actor uuid;item public.chapters;begin
 actor:=public.social_actor(p_session);if actor is null then raise exception 'invalid session';end if;
 select c.* into item from public.chapters c join public.stories s on s.id=c.story_id where c.id=p_chapter and s.author_id=actor for update of c;
 if item.id is null then raise exception 'chapter unavailable';end if;
 if p_status not in ('draft','published','unpublished','scheduled')or(p_status='scheduled'and(p_scheduled_for is null or p_scheduled_for<=now()))then raise exception 'invalid publication';end if;
 delete from public.scheduled_chapters where chapter_id=p_chapter;
 if p_status='scheduled'then insert into public.scheduled_chapters(chapter_id,scheduled_for)values(p_chapter,p_scheduled_for);end if;
 update public.chapters set published=p_status='published',publication_status=p_status,
 original_published_at=case when p_status='published'then coalesce(original_published_at,now())else original_published_at end,
 republished_at=case when p_status='published'and not item.published and item.original_published_at is not null then now()else republished_at end,
 updated_at=now()where id=p_chapter returning * into item;
 return to_jsonb(item);
end;$$;
revoke all on function public.set_chapter_publication(text,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.set_chapter_publication(text,uuid,text,timestamptz) to service_role;

commit;
