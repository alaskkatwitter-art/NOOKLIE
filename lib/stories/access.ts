import type { SupabaseClient } from '@supabase/supabase-js';

export async function getStoryEditAccess(client: SupabaseClient, storyId: string, profileId: string) {
  const { data: story, error: storyError } = await client.from('stories').select('id, author_id').eq('id', storyId).maybeSingle();
  if (storyError) throw storyError;
  if (!story) return { canEdit: false, isOwner: false };
  if (story.author_id === profileId) return { canEdit: true, isOwner: true };
  const { data: membership, error } = await client.from('story_collaborators').select('id')
    .eq('story_id', storyId).eq('profile_id', profileId).eq('role', 'coauthor').eq('status', 'active').maybeSingle();
  if (error) throw error;
  return { canEdit: Boolean(membership), isOwner: false };
}
