-- Private, account-scoped controls; group invitations require acceptance.
create table public.profile_mutes (
 user_id uuid not null references public.profiles(id) on delete cascade,
 target_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(user_id,target_id), check(user_id<>target_id)
);
create index profile_mutes_target_idx on public.profile_mutes(target_id);
alter table public.chat_threads add column kind text not null default 'direct' check(kind in('direct','group')),
 add column name text check(char_length(name) between 1 and 60);
alter table public.chat_threads alter column recipient_id drop not null;
alter table public.chat_threads add constraint chat_thread_shape check (
 (kind='direct' and recipient_id is not null and name is null) or (kind='group' and recipient_id is null and name is not null)
);
drop index public.chat_pair_idx;
create unique index chat_pair_idx on public.chat_threads(least(initiator_id,recipient_id),greatest(initiator_id,recipient_id)) where kind='direct';
create table public.chat_group_members (
 thread_id uuid not null references public.chat_threads(id) on delete cascade,
 profile_id uuid not null references public.profiles(id) on delete cascade,
 status text not null default 'pending' check(status in('pending','accepted')),
 joined_at timestamptz not null default now(),primary key(thread_id,profile_id)
);
create index chat_group_members_profile_idx on public.chat_group_members(profile_id,thread_id);
create function public.chat_group_capacity() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if tg_op='UPDATE' and new.thread_id=old.thread_id then return new;end if;
 perform 1 from public.chat_threads where id=new.thread_id and kind='group' for update;
 if not found then raise exception 'Not a group';end if;
 if (select count(*) from public.chat_group_members where thread_id=new.thread_id)>=15 then raise exception 'Group limit is 15';end if;
 return new;
end $$;
create trigger chat_group_capacity before insert or update of thread_id on public.chat_group_members for each row execute function public.chat_group_capacity();
alter table public.chat_messages drop constraint chat_messages_media_type_check;
alter table public.chat_messages add constraint chat_messages_media_type_check check(media_type in('image/jpeg','image/png','image/webp','image/gif','audio/webm','audio/ogg','audio/mpeg','audio/wav','audio/mp4'));
alter table public.chat_messages add column is_sticker boolean not null default false;
alter table public.chat_messages add constraint chat_sticker_is_image check(not is_sticker or coalesce(media_type like 'image/%',false));

create or replace function public.profile_content_allowed(p_owner uuid,p_viewer uuid default null) returns boolean language sql stable security invoker set search_path=pg_catalog as $$
select exists(select 1 from public.profiles p left join public.auth_accounts a on a.id=p.user_id where p.id=p_owner and p.moderation_hidden_at is null and a.account_status is distinct from 'suspended' and (not p.is_private or p.id=p_viewer or exists(select 1 from public.follows f where f.following_id=p.id and f.follower_id=p_viewer)) and not exists(select 1 from public.chat_blocks b where (b.blocker_id=p_owner and b.blocked_id=p_viewer)or(b.blocker_id=p_viewer and b.blocked_id=p_owner)));
$$;
create function public.profile_control(p_session text,p_target uuid,p_action text) returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid:=public.social_actor(p_session);begin
 if actor is null or actor=p_target or not exists(select 1 from public.profiles where id=p_target) then return false;end if;
 if p_action='block' then
 insert into public.chat_blocks(blocker_id,blocked_id)values(actor,p_target)on conflict do nothing;
 delete from public.follows where (follower_id=actor and following_id=p_target)or(follower_id=p_target and following_id=actor);
 delete from public.follow_requests where (requester_id=actor and target_id=p_target)or(requester_id=p_target and target_id=actor);
 elsif p_action='unblock' then delete from public.chat_blocks where blocker_id=actor and blocked_id=p_target;
 elsif p_action='mute' then insert into public.profile_mutes(user_id,target_id)values(actor,p_target)on conflict do nothing;
 elsif p_action='unmute' then delete from public.profile_mutes where user_id=actor and target_id=p_target;
 else return false;end if;
 return true;
end $$;
create function public.chat_group_create(p_session text,p_name text,p_members uuid[]) returns uuid language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid:=public.social_actor(p_session); thread uuid; target uuid; members uuid[];begin
 if actor is null or p_name is null or char_length(btrim(p_name)) not between 1 and 60 then raise exception 'Invalid group';end if;
 select array_agg(distinct member) into members from unnest(array_append(coalesce(p_members,'{}'),actor)) member;
 if cardinality(members) not between 2 and 15 or array_position(members,null) is not null then raise exception 'Choose 2 to 15 people including yourself';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if(select count(*)from public.chat_threads where initiator_id=actor and created_at>now()-interval '1 hour')>=10 then raise exception 'Too many requests';end if;
 foreach target in array members loop
 if not exists(select 1 from public.profiles p join public.auth_accounts a on a.id=p.user_id where p.id=target and p.moderation_hidden_at is null and a.account_status='active') then raise exception 'Profile unavailable';end if;
 if exists(select 1 from public.chat_blocks b where (b.blocker_id=target and b.blocked_id=any(members))or(b.blocked_id=target and b.blocker_id=any(members))) then raise exception 'Group unavailable';end if;
 end loop;
 insert into public.chat_threads(initiator_id,kind,name,status)values(actor,'group',btrim(p_name),'accepted')returning id into thread;
 foreach target in array members loop
 insert into public.chat_group_members(thread_id,profile_id,status)values(thread,target,case when target=actor then 'accepted' else 'pending' end);
 if target<>actor then perform public.social_notify(target,actor,'chat_request','convidou você para um grupo.','/chat?thread='||thread,'group-invite:'||thread);end if;
 end loop;
 return thread;
end $$;
create function public.chat_group_action(p_session text,p_thread uuid,p_action text) returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid:=public.social_actor(p_session);t public.chat_threads;begin
 select * into t from public.chat_threads where id=p_thread and kind='group' for update;
 if actor is null or t.id is null or not exists(select 1 from public.chat_group_members where thread_id=p_thread and profile_id=actor)then return false;end if;
 if p_action='accept' then
 if exists(select 1 from public.chat_blocks b join public.chat_group_members m on m.thread_id=p_thread where (b.blocker_id=actor and b.blocked_id=m.profile_id)or(b.blocked_id=actor and b.blocker_id=m.profile_id))then return false;end if;
 update public.chat_group_members set status='accepted' where thread_id=p_thread and profile_id=actor;return true;
 elsif p_action in('deny','leave') then
 delete from public.chat_group_members where thread_id=p_thread and profile_id=actor;
 if t.initiator_id=actor then
 update public.chat_threads set initiator_id=(select profile_id from public.chat_group_members where thread_id=p_thread order by (status='accepted') desc,joined_at limit 1)where id=p_thread and exists(select 1 from public.chat_group_members where thread_id=p_thread);
 end if;
 -- Retain empty threads for existing reported evidence; former members have no access.
 return true;
 end if;return false;
end $$;
-- Group writes use the same encryption and rate limits as direct conversations.
create function public.chat_group_send(p_session text,p_thread uuid,p_id uuid,p_cipher text,p_reply uuid default null,p_media_path text default null,p_media_type text default null,p_sticker boolean default false) returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid:=public.social_actor(p_session);target uuid;begin
 perform 1 from public.chat_threads where id=p_thread and kind='group' for update;if not found or actor is null then return false;end if;
 if not exists(select 1 from public.chat_group_members where thread_id=p_thread and profile_id=actor and status='accepted')then return false;end if;
 if exists(select 1 from public.chat_blocks b join public.chat_group_members m on m.thread_id=p_thread and m.status='accepted' where (b.blocker_id=actor and b.blocked_id=m.profile_id)or(b.blocked_id=actor and b.blocker_id=m.profile_id))then return false;end if;
 if p_reply is not null and not exists(select 1 from public.chat_messages where id=p_reply and thread_id=p_thread)then return false;end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if (select count(*)from public.chat_messages where sender_id=actor and created_at>now()-interval '1 minute')>=30 then raise exception 'Too many messages';end if;
 insert into public.chat_messages(id,thread_id,sender_id,body_cipher,reply_to,media_path,media_type,is_sticker)values(p_id,p_thread,actor,p_cipher,p_reply,p_media_path,p_media_type,p_sticker);
 update public.chat_threads set updated_at=now()where id=p_thread;
 for target in select profile_id from public.chat_group_members where thread_id=p_thread and status='accepted' and profile_id<>actor loop
 perform public.social_notify(target,actor,'chat_message','enviou uma mensagem no grupo.','/chat?thread='||p_thread,'chat-message:'||p_id);
 end loop;return true;
end $$;

create table public.support_tickets (
 id uuid primary key default gen_random_uuid(), reporter_id uuid not null references public.auth_accounts(id),
 target_user_id uuid references public.auth_accounts(id), department_id uuid not null references public.departments(id),
 category text not null check(category in('help','feedback','safety','appeal')),
 subject text not null check(char_length(subject) between 3 and 120), details text not null check(char_length(details) between 10 and 5000),
 status text not null default 'pending' check(status in('pending','in_review','resolved','dismissed')),
 internal_notes text not null default '', response text not null default '', reviewer_id uuid references public.auth_accounts(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index support_tickets_department_idx on public.support_tickets(department_id,status,created_at desc);
create index support_tickets_reporter_idx on public.support_tickets(reporter_id,created_at desc);
create index support_tickets_target_idx on public.support_tickets(target_user_id);
create index support_tickets_reviewer_idx on public.support_tickets(reviewer_id);
create table public.moderation_warnings (
 id uuid primary key default gen_random_uuid(),target_user_id uuid not null references public.auth_accounts(id),
 actor_user_id uuid not null references public.auth_accounts(id),source_type text not null check(source_type in('report','support','chat')),
 source_id uuid not null,reason text not null check(char_length(reason) between 10 and 2000),created_at timestamptz not null default now(),unique(source_type,source_id)
);
create index moderation_warnings_target_idx on public.moderation_warnings(target_user_id,created_at desc);
create index moderation_warnings_actor_idx on public.moderation_warnings(actor_user_id);
create function public.moderation_warn(p_session text,p_source_type text,p_source_id uuid,p_reason text) returns uuid language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid:=public.admin_current_actor(p_session);target uuid;dept uuid;warning uuid;begin
 if char_length(btrim(coalesce(p_reason,''))) not between 10 and 2000 then raise exception 'Explain the warning';end if;
 if p_source_type='report' then select target_user_id,department_id into target,dept from public.moderation_reports where id=p_source_id for update;
 elsif p_source_type='support' then select target_user_id,department_id into target,dept from public.support_tickets where id=p_source_id for update;
 elsif p_source_type='chat' then
 select p.user_id into target from public.chat_reports r join public.chat_messages m on m.id=r.message_id and m.thread_id=r.thread_id join public.profiles p on p.id=m.sender_id where r.id=p_source_id;
 select id into dept from public.departments where slug='moderacao' and status='active';
 end if;
 if target is null or target=actor then raise exception 'No eligible target in this report';end if;
 perform public.admin_assert_permission(actor,'moderation.manage',dept);
 if exists(select 1 from public.platform_admins where user_id=target)then raise exception 'Administrator review required';end if;
 insert into public.moderation_warnings(target_user_id,actor_user_id,source_type,source_id,reason)values(target,actor,p_source_type,p_source_id,btrim(p_reason))returning id into warning;
 insert into public.admin_audit_log(actor_user_id,action,subject_type,subject_id,details)values(actor,'moderation.warning','account',target,jsonb_build_object('warning_id',warning,'source_type',p_source_type,'source_id',p_source_id,'reason',btrim(p_reason)));
 insert into public.user_notifications(user_id,notification_type,title,body,href)values(target,'moderation_warning','Advertência da moderação',btrim(p_reason),'/notificacoes');
 return warning;
end $$;
-- All new data and RPCs are server-only, consistent with Nooklie's custom sessions.
do $$declare tab text;fn record;begin
 foreach tab in array array['profile_mutes','chat_group_members','support_tickets','moderation_warnings']loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('revoke all on public.%I from public,anon,authenticated',tab);
 execute format('grant select,insert,update,delete on public.%I to service_role',tab);
 end loop;
 for fn in select p.oid::regprocedure name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('chat_group_capacity','profile_control','chat_group_create','chat_group_action','chat_group_send','moderation_warn')loop
 execute format('revoke all on function %s from public,anon,authenticated',fn.name);
 execute format('grant execute on function %s to service_role',fn.name);
 end loop;
end $$;
create function public.chat_direct_send(p_session text,p_thread uuid,p_id uuid,p_cipher text,p_reply uuid default null,p_media_path text default null,p_media_type text default null,p_sticker boolean default false) returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if not exists(select 1 from public.chat_threads where id=p_thread and kind='direct')then return false;end if;
 if not public.chat_send(p_session,p_thread,p_id,p_cipher,p_reply,p_media_path,p_media_type)then return false;end if;
 update public.chat_messages set is_sticker=p_sticker where id=p_id and thread_id=p_thread;return true;
end $$;
revoke all on function public.chat_direct_send(text,uuid,uuid,text,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.chat_direct_send(text,uuid,uuid,text,uuid,text,text,boolean) to service_role;
create function public.support_review(p_session text,p_id uuid,p_status text,p_notes text,p_response text) returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid:=public.admin_current_actor(p_session);ticket public.support_tickets;begin
 select * into ticket from public.support_tickets where id=p_id for update;if ticket.id is null then return false;end if;
 perform public.admin_assert_permission(actor,'moderation.manage',ticket.department_id);
 if p_status not in('in_review','resolved','dismissed')or char_length(coalesce(p_notes,''))>8000 or char_length(coalesce(p_response,''))>3000 then raise exception 'Invalid review';end if;
 update public.support_tickets set status=p_status,internal_notes=coalesce(p_notes,''),response=coalesce(p_response,''),reviewer_id=actor,updated_at=now()where id=p_id;
 insert into public.admin_audit_log(actor_user_id,action,subject_type,subject_id,details)values(actor,'support.review','support_ticket',p_id,jsonb_build_object('status',p_status,'notes',p_notes));
 if p_response<>'' and p_response is distinct from ticket.response then insert into public.user_notifications(user_id,notification_type,title,body,href)values(ticket.reporter_id,'support_response','Resposta da ouvidoria',p_response,'/ouvidoria');end if;
 return true;
end $$;
revoke all on function public.support_review(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.support_review(text,uuid,text,text,text) to service_role;

-- Existing direct-only RPCs must not become a group authorization path.
create or replace function public.chat_action(p_session text,p_thread uuid,p_action text) returns boolean language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid; t public.chat_threads;peer uuid;begin
actor:=public.social_actor(p_session);select * into t from public.chat_threads where id=p_thread for update;
if actor is null or t.id is null or t.kind<>'direct' or actor not in(t.initiator_id,t.recipient_id) then return false;end if;
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
if actor is null or t.id is null or t.kind<>'direct' or actor not in(t.initiator_id,t.recipient_id)or t.status<>'accepted' then return false;end if;
peer:=case when actor=t.initiator_id then t.recipient_id else t.initiator_id end;
if exists(select 1 from public.chat_blocks b where (b.blocker_id=actor and b.blocked_id=peer)or(b.blocker_id=peer and b.blocked_id=actor))then return false;end if;
if p_reply is not null and not exists(select 1 from public.chat_messages where id=p_reply and thread_id=p_thread)then return false;end if;
perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
if (select count(*)from public.chat_messages where sender_id=actor and created_at>now()-interval '1 minute')>=30 then raise exception 'Muitas mensagens. Aguarde um instante';end if;
insert into public.chat_messages(id,thread_id,sender_id,body_cipher,reply_to,media_path,media_type)values(p_id,p_thread,actor,p_cipher,p_reply,p_media_path,p_media_type)on conflict(id)do nothing;
update public.chat_threads set updated_at=now()where id=p_thread;
perform public.social_notify(peer,actor,'chat_message','enviou uma mensagem privada.','/chat?thread='||p_thread,'chat-message:'||p_id);
return true;end;$$;


-- Profile controls also apply to future follow requests and interaction notifications.
create or replace function public.social_follow(p_session text,p_target uuid,p_action text)returns text language plpgsql security invoker set search_path=pg_catalog as $$
declare actor uuid; private boolean;begin
actor:=public.social_actor(p_session);if actor is null or actor=p_target then raise exception 'Não autorizado';end if;
if p_action<>'unfollow' and exists(select 1 from public.chat_blocks b where (b.blocker_id=actor and b.blocked_id=p_target)or(b.blocker_id=p_target and b.blocked_id=actor))then raise exception 'Interação indisponível';end if;
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
create or replace function public.social_notify(p_target uuid,p_actor uuid,p_kind text,p_body text,p_href text,p_key text) returns void language sql security invoker set search_path=pg_catalog as $$
insert into public.user_notifications(user_id,notification_type,title,body,href,source_key)
select target.user_id,p_kind,'Nova interação no Nooklie',coalesce('@'||actor.username,'Alguém')||' '||p_body,p_href,p_key
from public.profiles target left join public.profiles actor on actor.id=p_actor
where target.id=p_target and target.id is distinct from p_actor and target.social_notifications
and not exists(select 1 from public.profile_mutes m where m.user_id=p_target and m.target_id=p_actor)
and not exists(select 1 from public.chat_blocks b where (b.blocker_id=p_target and b.blocked_id=p_actor)or(b.blocker_id=p_actor and b.blocked_id=p_target))
on conflict(user_id,source_key) do nothing;
$$;

