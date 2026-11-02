alter table public.profiles add column if not exists is_private boolean not null default false;
alter table public.profiles add column if not exists social_notifications boolean not null default true;
alter table public.profiles add column if not exists chapter_notifications boolean not null default true;
alter table public.user_notifications add column if not exists source_key text;
create unique index if not exists notifications_source_key_idx on public.user_notifications(user_id,source_key);

create table public.follow_requests(requester_id uuid references public.profiles(id) on delete cascade,target_id uuid references public.profiles(id) on delete cascade,created_at timestamptz not null default now(),primary key(requester_id,target_id),check(requester_id<>target_id));
create index follow_requests_target_idx on public.follow_requests(target_id);
create table public.chapter_favorites(chapter_id uuid references public.chapters(id) on delete cascade,user_id uuid references public.profiles(id) on delete cascade,created_at timestamptz not null default now(),primary key(chapter_id,user_id));
create index chapter_favorites_user_idx on public.chapter_favorites(user_id);
create table public.chat_blocks(blocker_id uuid references public.profiles(id) on delete cascade,blocked_id uuid references public.profiles(id) on delete cascade,created_at timestamptz not null default now(),primary key(blocker_id,blocked_id),check(blocker_id<>blocked_id));
create index chat_blocks_blocked_idx on public.chat_blocks(blocked_id);
create table public.chat_threads(id uuid primary key default gen_random_uuid(),initiator_id uuid not null references public.profiles(id) on delete cascade,recipient_id uuid not null references public.profiles(id) on delete cascade,status text not null default 'pending' check(status in('pending','accepted','spam')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(initiator_id<>recipient_id));
create unique index chat_pair_idx on public.chat_threads(least(initiator_id,recipient_id),greatest(initiator_id,recipient_id));
create index chat_initiator_idx on public.chat_threads(initiator_id,updated_at desc);
create index chat_recipient_idx on public.chat_threads(recipient_id,updated_at desc);
create table public.chat_messages(id uuid primary key,thread_id uuid not null references public.chat_threads(id) on delete cascade,sender_id uuid not null references public.profiles(id) on delete cascade,body_cipher text not null,media_path text,media_type text check(media_type in('image/jpeg','image/png','image/webp','audio/webm','audio/ogg','audio/mpeg','audio/wav','audio/mp4')),reply_to uuid references public.chat_messages(id) on delete set null,created_at timestamptz not null default now(),read_at timestamptz,check(char_length(body_cipher)<=16000));
create index chat_messages_thread_idx on public.chat_messages(thread_id,created_at desc,id);
create index chat_messages_sender_idx on public.chat_messages(sender_id,created_at desc);
create index chat_messages_reply_idx on public.chat_messages(reply_to);
create table public.chat_reports(id uuid primary key default gen_random_uuid(),reporter_id uuid not null references public.profiles(id),thread_id uuid not null references public.chat_threads(id),message_id uuid references public.chat_messages(id),reason text not null check(char_length(reason) between 3 and 2000),created_at timestamptz not null default now(),status text not null default 'pending' check(status in('pending','reviewed')));
create index chat_reports_reporter_idx on public.chat_reports(reporter_id);
create index chat_reports_thread_idx on public.chat_reports(thread_id);
create index chat_reports_message_idx on public.chat_reports(message_id);

do $$declare tab text;begin foreach tab in array array['follow_requests','chapter_favorites','chat_blocks','chat_threads','chat_messages','chat_reports'] loop execute format('alter table public.%I enable row level security',tab);execute format('revoke all on public.%I from public,anon,authenticated',tab);execute format('grant all on public.%I to service_role',tab);end loop;end$$;

create or replace function public.social_actor(p_session text) returns uuid language sql stable security invoker set search_path=pg_catalog as $$
select p.id from public.auth_sessions s join public.auth_accounts a on a.id=s.user_id join public.profiles p on p.user_id=a.id where s.token_hash=p_session and s.expires_at>now() and a.account_status is distinct from 'suspended' and p.moderation_hidden_at is null limit 1;
$$;
create or replace function public.profile_content_allowed(p_owner uuid,p_viewer uuid default null) returns boolean language sql stable security invoker set search_path=pg_catalog as $$
select exists(select 1 from public.profiles p left join public.auth_accounts a on a.id=p.user_id where p.id=p_owner and p.moderation_hidden_at is null and a.account_status is distinct from 'suspended' and (not p.is_private or p.id=p_viewer or exists(select 1 from public.follows f where f.following_id=p.id and f.follower_id=p_viewer)));
$$;
create or replace function public.social_notify(p_target uuid,p_actor uuid,p_kind text,p_body text,p_href text,p_key text) returns void language sql security invoker set search_path=pg_catalog as $$
insert into public.user_notifications(user_id,notification_type,title,body,href,source_key)
select target.user_id,p_kind,'Nova interação no Nooklie',coalesce('@'||actor.username,'Alguém')||' '||p_body,p_href,p_key
from public.profiles target left join public.profiles actor on actor.id=p_actor
where target.id=p_target and target.id is distinct from p_actor and target.social_notifications
on conflict(user_id,source_key) do nothing;
$$;

create or replace function public.chat_request(p_session text,p_target uuid) returns uuid language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid; thread uuid;begin
actor:=public.social_actor(p_session);
if actor is null or actor=p_target or not exists(select 1 from public.profiles p where p.id=p_target and p.moderation_hidden_at is null) then raise exception 'Solicitação inválida';end if;
if exists(select 1 from public.chat_blocks b where (b.blocker_id=actor and b.blocked_id=p_target) or (b.blocker_id=p_target and b.blocked_id=actor)) then raise exception 'Conversa indisponível';end if;
perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
select t.id into thread from public.chat_threads t where least(t.initiator_id,t.recipient_id)=least(actor,p_target) and greatest(t.initiator_id,t.recipient_id)=greatest(actor,p_target);
if thread is not null then return thread;end if;
if (select count(*) from public.chat_threads where initiator_id=actor and created_at>now()-interval '1 hour')>=10 then raise exception 'Aguarde antes de enviar novas solicitações';end if;
insert into public.chat_threads(initiator_id,recipient_id) values(actor,p_target) returning id into thread;
perform public.social_notify(p_target,actor,'chat_request','enviou uma solicitação de conversa.','/chat?thread='||thread,'chat-request:'||thread);
return thread;end;$$;

create or replace function public.chat_action(p_session text,p_thread uuid,p_action text) returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid; t public.chat_threads;peer uuid;begin
actor:=public.social_actor(p_session);select * into t from public.chat_threads where id=p_thread for update;
if actor is null or t.id is null or actor not in(t.initiator_id,t.recipient_id) then return false;end if;
peer:=case when actor=t.initiator_id then t.recipient_id else t.initiator_id end;
if p_action='block' then insert into public.chat_blocks(blocker_id,blocked_id)values(actor,peer)on conflict do nothing;return true;end if;
if p_action='unblock' then delete from public.chat_blocks where blocker_id=actor and blocked_id=peer;return true;end if;
if exists(select 1 from public.chat_blocks b where (b.blocker_id=actor and b.blocked_id=peer)or(b.blocker_id=peer and b.blocked_id=actor))then return false;end if;
if p_action='accept' and actor=t.recipient_id then update public.chat_threads set status='accepted',updated_at=now()where id=t.id;return true;end if;
if p_action='deny' and actor=t.recipient_id then update public.chat_threads set status='spam',updated_at=now()where id=t.id;return true;end if;
return false;end;$$;

create or replace function public.chat_send(p_session text,p_thread uuid,p_id uuid,p_cipher text,p_reply uuid default null,p_media_path text default null,p_media_type text default null)returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid;t public.chat_threads;peer uuid;begin
actor:=public.social_actor(p_session);select * into t from public.chat_threads where id=p_thread for update;
if actor is null or t.id is null or actor not in(t.initiator_id,t.recipient_id)or t.status<>'accepted' then return false;end if;
peer:=case when actor=t.initiator_id then t.recipient_id else t.initiator_id end;
if exists(select 1 from public.chat_blocks b where (b.blocker_id=actor and b.blocked_id=peer)or(b.blocker_id=peer and b.blocked_id=actor))then return false;end if;
if p_reply is not null and not exists(select 1 from public.chat_messages where id=p_reply and thread_id=p_thread)then return false;end if;
perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
if (select count(*)from public.chat_messages where sender_id=actor and created_at>now()-interval '1 minute')>=30 then raise exception 'Muitas mensagens. Aguarde um instante';end if;
insert into public.chat_messages(id,thread_id,sender_id,body_cipher,reply_to,media_path,media_type)values(p_id,p_thread,actor,p_cipher,p_reply,p_media_path,p_media_type)on conflict(id)do nothing;
update public.chat_threads set updated_at=now()where id=p_thread;
perform public.social_notify(peer,actor,'chat_message','enviou uma mensagem privada.','/chat?thread='||p_thread,'chat-message:'||p_id);
return true;end;$$;

create or replace function public.social_interaction_notification()returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid;target uuid;other uuid;story uuid;chapter uuid;post uuid;href text;phrase text;begin
if tg_table_name='follows' then actor:=new.follower_id;target:=new.following_id;phrase:='começou a seguir você.';href:='/perfil/'||(select username from public.profiles where id=actor);
elsif tg_table_name='follow_requests' then actor:=new.requester_id;target:=new.target_id;phrase:='pediu para seguir seu perfil privado.';href:='/solicitacoes';
elsif tg_table_name in('chapter_likes','chapter_favorites')then actor:=new.user_id;chapter:=new.chapter_id;select s.author_id into target from public.chapters c join public.stories s on s.id=c.story_id where c.id=chapter;phrase:=case when tg_table_name='chapter_favorites'then'favoritou um capítulo seu.'else'curtiu um capítulo seu.'end;href:='/capitulo/'||chapter;
elsif tg_table_name='story_likes' then actor:=new.user_id;select author_id into target from public.stories where id=new.story_id;phrase:='curtiu sua história.';href:='/historia/'||new.story_id;
elsif tg_table_name='comments' then actor:=new.user_id;chapter:=new.chapter_id;select s.author_id into target from public.chapters c join public.stories s on s.id=c.story_id where c.id=chapter;phrase:='comentou em um capítulo seu.';href:='/capitulo/'||chapter;if new.parent_comment_id is not null then select user_id into other from public.comments where id=new.parent_comment_id;end if;
elsif tg_table_name='comment_likes' then actor:=new.user_id;select user_id,chapter_id into target,chapter from public.comments where id=new.comment_id;phrase:='curtiu seu comentário.';href:='/capitulo/'||chapter;
elsif tg_table_name='nook_comments' then actor:=new.author_id;post:=new.post_id;select user_id into target from public.nook_posts where id=post;phrase:='comentou no seu mural.';href:='/feed#post-'||post;if new.parent_id is not null then select author_id into other from public.nook_comments where id=new.parent_id;end if;
elsif tg_table_name='nook_comment_reactions' then actor:=new.user_id;select author_id,post_id into target,post from public.nook_comments where id=new.comment_id;phrase:='reagiu ao seu comentário no mural.';href:='/feed#post-'||post;
elsif tg_table_name='nook_post_reactions' then actor:=new.user_id;select user_id into target from public.nook_posts where id=new.post_id;phrase:='reagiu à sua publicação.';href:='/feed#post-'||new.post_id;
elsif tg_table_name='nook_saved_posts' then actor:=new.user_id;select user_id into target from public.nook_posts where id=new.post_id;phrase:='salvou sua publicação.';href:='/feed#post-'||new.post_id;
elsif tg_table_name='reading_list_items' then select user_id into actor from public.reading_lists where id=new.list_id;select author_id into target from public.stories where id=new.story_id;phrase:='adicionou sua história a uma lista de leitura.';href:='/historia/'||new.story_id;
elsif tg_table_name='nook_posts' then actor:=new.user_id;if new.story_id is null then return new;end if;select author_id into target from public.stories where id=new.story_id;phrase:='vinculou sua história a uma publicação no mural.';href:='/feed#post-'||new.id;
elsif tg_table_name='posts' then actor:=new.user_id;select s.author_id into target from public.chapters c join public.stories s on s.id=c.story_id where c.id=new.chapter_id;phrase:='citou um trecho do seu capítulo no perfil.';href:='/capitulo/'||new.chapter_id;
elsif tg_table_name='post_likes' then actor:=new.user_id;select user_id into target from public.posts where id=new.post_id;phrase:='curtiu sua publicação.';href:='/perfil/'||(select username from public.profiles where id=target);
else return new;end if;
perform public.social_notify(target,actor,tg_table_name,phrase,href,tg_table_name||':'||coalesce(to_jsonb(new)->>'id',md5(to_jsonb(new)::text))||':'||target);
if other is not null and other is distinct from target then perform public.social_notify(other,actor,'reply','respondeu ao seu comentário.',href,tg_table_name||':'||coalesce(to_jsonb(new)->>'id',md5(to_jsonb(new)::text))||':'||other);end if;
return new;end;$$;
do $$declare tab text;begin foreach tab in array array['follows','follow_requests','chapter_likes','chapter_favorites','story_likes','comments','comment_likes','nook_comments','nook_comment_reactions','nook_post_reactions','nook_saved_posts','reading_list_items','nook_posts','posts','post_likes']loop execute format('create trigger social_notify_insert after insert on public.%I for each row execute function public.social_interaction_notification()',tab);end loop;end$$;

create or replace function public.social_chapter_release()returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare author uuid;title text;begin
if not new.published or (tg_op='UPDATE' and old.published)then return new;end if;
select author_id,s.title into author,title from public.stories s where s.id=new.story_id;
insert into public.user_notifications(user_id,notification_type,title,body,href,source_key)
select p.user_id,'chapter_release','Novo capítulo disponível','Há um novo capítulo de '||title||'.','/capitulo/'||new.id,'chapter-release:'||new.id
from public.profiles p where p.id<>author and p.chapter_notifications and public.profile_content_allowed(author,p.id) and (exists(select 1 from public.follows f where f.follower_id=p.id and f.following_id=author)or exists(select 1 from public.reading_lists l join public.reading_list_items i on i.list_id=l.id where l.user_id=p.id and i.story_id=new.story_id))
on conflict(user_id,source_key)do nothing;return new;end;$$;
create trigger social_chapter_release after insert or update of published on public.chapters for each row execute function public.social_chapter_release();

create or replace function public.chat_safety_notice()returns trigger language plpgsql security invoker set search_path=pg_catalog as $$begin
insert into public.user_notifications(user_id,notification_type,title,body,href,source_key)values(new.id,'chat_safety_notice','Nooklie · Respeito, segurança e paz','Nosso chat não oferece ligações de voz ou vídeo, para proteger a comunidade e especialmente os menores de idade. Aceite apenas conversas que desejar. Imagens e áudios só podem ser enviados em conversas aceitas. Não compartilhe dados pessoais ou imagens íntimas. Você pode negar solicitações, bloquear e denunciar. Prezamos pelo respeito, pela segurança e pela paz.','/chat','chat-safety-v1')on conflict(user_id,source_key)do nothing;return new;end;$$;
create trigger chat_safety_signup after insert on public.auth_accounts for each row execute function public.chat_safety_notice();
insert into public.user_notifications(user_id,notification_type,title,body,href,source_key)select id,'chat_safety_notice','Nooklie · Respeito, segurança e paz','Nosso chat não oferece ligações de voz ou vídeo, para proteger a comunidade e especialmente os menores de idade. Aceite apenas conversas que desejar. Imagens e áudios só podem ser enviados em conversas aceitas. Não compartilhe dados pessoais ou imagens íntimas. Você pode negar solicitações, bloquear e denunciar. Prezamos pelo respeito, pela segurança e pela paz.','/chat','chat-safety-v1'from public.auth_accounts on conflict(user_id,source_key)do nothing;

do $$declare fn record;begin for fn in select p.oid::regprocedure name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname in('social_actor','profile_content_allowed','social_notify','chat_request','chat_action','chat_send','social_interaction_notification','social_chapter_release','chat_safety_notice')loop execute format('revoke all on function %s from public,anon,authenticated',fn.name);execute format('grant execute on function %s to service_role',fn.name);end loop;end$$;

create or replace function public.search_visible_stories(
 p_viewer uuid default null,
 p_query text default null,p_include_slugs text[] default '{}',p_exclude_slugs text[] default '{}',p_rating text default null,p_status text default null,p_sort text default 'updated',p_limit integer default 24,p_offset integer default 0
) returns table(id uuid,author_id uuid,title text,description text,cover_url text,status text,rating text,created_at timestamptz,updated_at timestamptz)
language sql stable security invoker set search_path=pg_catalog as $$
with searchable as (
 select s.*,public.discovery_key(s.title) title_key,
 public.discovery_key(concat_ws(' ',s.title,s.description,s.fandom,p.username,p.display_name,
 (select string_agg(t.name,' ') from public.story_tags st join public.tags t on t.id=st.tag_id where st.story_id=s.id))) document_key,
 public.discovery_story_fandoms(s.id,s.fandom) fandom_keys
 from public.stories s join public.profiles p on p.id=s.author_id left join public.auth_accounts a on a.id=p.user_id
 where public.profile_content_allowed(s.author_id,p_viewer) and s.moderation_hidden_at is null and p.moderation_hidden_at is null and a.account_status is distinct from 'suspended'
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
revoke all on function public.search_visible_stories(uuid,text,text[],text[],text,text,text,integer,integer) from public,anon,authenticated;grant execute on function public.search_visible_stories(uuid,text,text[],text[],text,text,text,integer,integer) to service_role;

create or replace function public.search_public_stories(
 p_query text default null,p_include_slugs text[] default '{}',p_exclude_slugs text[] default '{}',p_rating text default null,p_status text default null,p_sort text default 'updated',p_limit integer default 24,p_offset integer default 0
) returns table(id uuid,author_id uuid,title text,description text,cover_url text,status text,rating text,created_at timestamptz,updated_at timestamptz)
language sql stable security invoker set search_path=pg_catalog as $$
select * from public.search_visible_stories(null,p_query,p_include_slugs,p_exclude_slugs,p_rating,p_status,p_sort,p_limit,p_offset);
$$;
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
 where public.profile_content_allowed(s.author_id,(select id from reader limit 1)) and s.moderation_hidden_at is null and p.moderation_hidden_at is null and a.account_status is distinct from 'suspended'
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
create or replace function public.record_discovery_activity(p_account uuid, p_story uuid, p_chapter uuid default null, p_percent numeric default 0, p_position integer default 0, p_read boolean default false)
returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare reader uuid; author uuid;
begin
 select p.id into reader from public.profiles p join public.auth_accounts a on a.id=p.user_id
 where p.user_id=p_account and p.moderation_hidden_at is null and a.account_status is distinct from 'suspended';
 select s.author_id into author from public.stories s join public.profiles p on p.id=s.author_id
 left join public.auth_accounts a on a.id=p.user_id
 where public.profile_content_allowed(s.author_id,reader) and s.id=p_story and s.moderation_hidden_at is null and p.moderation_hidden_at is null
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
create or replace function public.discovery_sitemap() returns table(id uuid,updated_at timestamptz)
language sql stable security invoker set search_path=pg_catalog as $$
select s.id,s.updated_at from public.stories s join public.profiles p on p.id=s.author_id left join public.auth_accounts a on a.id=p.user_id
where public.profile_content_allowed(s.author_id,null) and s.moderation_hidden_at is null and p.moderation_hidden_at is null and a.account_status is distinct from 'suspended'
and exists(select 1 from public.chapters c where c.story_id=s.id and c.published=true)
order by s.id limit 50000;
$$;
create or replace function public.discovery_fandom_catalog() returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$
with names as (
 select 'Universo original' name
 union all select btrim(part) from public.stories s cross join lateral regexp_split_to_table(s.fandom, ',') part
 where public.profile_content_allowed(s.author_id,null) and s.moderation_hidden_at is null and btrim(part)<>'' and exists(select 1 from public.chapters c where c.story_id=s.id and c.published=true)
 union all select t.name from public.tags t join public.tag_categories tc on tc.id=t.category_id where tc.slug='fandom'
), unique_names as(select min(name) name from names where char_length(name)<=100 group by public.discovery_key(name))
select coalesce(jsonb_agg(name order by name),'[]'::jsonb) from (select name from unique_names order by name limit 300) n;
$$;
-- All content is served by session-checked application APIs, never browser database roles.
revoke all on public.stories,public.chapters,public.chapter_media,public.comments,public.comment_likes,public.chapter_likes,public.story_likes,public.story_tags,public.follows,public.posts,public.post_likes,public.nook_posts,public.nook_comments,public.nook_comment_reactions,public.nook_post_media,public.nook_post_reactions,public.nook_saved_posts,public.reading_lists,public.reading_list_items,public.reading_progress,public.social_stories from anon,authenticated;
revoke all on public.profiles from anon,authenticated;
grant select(id,username,display_name,bio,avatar_url,cover_url,verified,is_official,is_private) on public.profiles to anon,authenticated;

create or replace function public.social_follow(p_session text,p_target uuid,p_action text)returns text language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid; private boolean;begin
actor:=public.social_actor(p_session);if actor is null or actor=p_target then raise exception 'Não autorizado';end if;
if p_action in('accept','deny')then
 if not exists(select 1 from public.follow_requests where requester_id=p_target and target_id=actor)then raise exception 'Solicitação não encontrada';end if;
 delete from public.follow_requests where requester_id=p_target and target_id=actor;
 if p_action='accept'then insert into public.follows(follower_id,following_id)values(p_target,actor)on conflict do nothing;return 'accepted';end if;return 'denied';
end if;
select is_private into private from public.profiles where id=p_target and moderation_hidden_at is null;if private is null then raise exception 'Perfil não encontrado';end if;
if p_action='unfollow'then delete from public.follows where follower_id=actor and following_id=p_target;delete from public.follow_requests where requester_id=actor and target_id=p_target;return 'unfollowed';end if;
if exists(select 1 from public.follows where follower_id=actor and following_id=p_target)then return 'following';end if;
if private then insert into public.follow_requests(requester_id,target_id)values(actor,p_target)on conflict do nothing;return 'requested';end if;
insert into public.follows(follower_id,following_id)values(actor,p_target)on conflict do nothing;return 'following';end;$$;
revoke all on function public.social_follow(text,uuid,text)from public,anon,authenticated;grant execute on function public.social_follow(text,uuid,text)to service_role;
do $$begin if to_regclass('storage.buckets')is not null then insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values('private-chat','private-chat',false,4194304,array['application/octet-stream'])on conflict(id)do nothing;end if;end$$;


create table public.chat_audit_access(id uuid primary key default gen_random_uuid(),admin_user_id uuid not null references public.auth_accounts(id),report_ids uuid[] not null,created_at timestamptz not null default now());alter table public.chat_audit_access enable row level security;revoke all on public.chat_audit_access from public,anon,authenticated;grant all on public.chat_audit_access to service_role;create index chat_audit_admin_idx on public.chat_audit_access(admin_user_id);
