BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN avatar_animation jsonb CHECK (jsonb_typeof(avatar_animation) = 'object'),
  ADD COLUMN cover_animation jsonb CHECK (jsonb_typeof(cover_animation) = 'object');

UPDATE storage.buckets
SET allowed_mime_types = array_append(allowed_mime_types, 'image/gif')
WHERE id IN ('avatars', 'profile-covers')
  AND NOT ('image/gif' = ANY (allowed_mime_types));

COMMIT;
