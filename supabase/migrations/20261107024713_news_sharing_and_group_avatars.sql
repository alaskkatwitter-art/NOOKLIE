alter table public.nook_posts add column news_slug text;
alter table public.nook_posts add constraint nook_posts_news_slug_check check (news_slug is null or news_slug in ('boas-vindas','originais','atualizacao-6-novembro-2026'));
alter table public.nook_posts add constraint nook_posts_one_link_check check (news_slug is null or story_id is null);
alter table public.chat_threads add column avatar_path text;
alter table public.chat_threads add constraint chat_group_avatar_path_check check (avatar_path is null or (kind='group' and avatar_path ~ ('^' || id::text || '/[a-f0-9-]+\.(webp|jpg|png)$')));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('group-avatars','group-avatars',false,4194304,array['image/jpeg','image/png','image/webp']);
-- Browser roles cannot read or write this bucket. Membership and ownership are
-- checked on the server before using the service role for each operation.
create policy group_avatars_server_only on storage.objects as restrictive for all to anon,authenticated using (bucket_id <> 'group-avatars') with check (bucket_id <> 'group-avatars');
