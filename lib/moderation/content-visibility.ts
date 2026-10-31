import type { SupabaseClient } from '@supabase/supabase-js';

type VisibilityClient = SupabaseClient;

export async function isPublicProfileVisible(
  supabase: VisibilityClient,
  profileOrUserId: string
): Promise<boolean> {
  let { data: profile, error } = await supabase
    .from('profiles')
    .select('id, user_id, moderation_hidden_at')
    .eq('id', profileOrUserId)
    .maybeSingle();
  if (error) throw error;
  if (!profile) {
    const fallback = await supabase
      .from('profiles')
      .select('id, user_id, moderation_hidden_at')
      .eq('user_id', profileOrUserId)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    profile = fallback.data;
  }
  if (!profile || profile.moderation_hidden_at) return false;

  const { data: account, error: accountError } = await supabase
    .from('auth_accounts')
    .select('id, account_status')
    .eq('id', profile.user_id)
    .maybeSingle();
  if (accountError) throw accountError;
  return account?.account_status !== 'suspended';
}

export async function isPublicStoryVisible(
  supabase: VisibilityClient,
  storyId: string
): Promise<boolean> {
  const { data: story, error } = await supabase
    .from('stories')
    .select('id, author_id, moderation_hidden_at')
    .eq('id', storyId)
    .maybeSingle();
  if (error) throw error;
  if (!story || story.moderation_hidden_at) return false;
  return isPublicProfileVisible(supabase, story.author_id);
}

export async function isPublicPostVisible(
  supabase: VisibilityClient,
  postId: string
): Promise<boolean> {
  const { data: post, error } = await supabase
    .from('nook_posts')
    .select('id, user_id, moderation_hidden_at')
    .eq('id', postId)
    .maybeSingle();
  if (error) throw error;
  if (!post || post.moderation_hidden_at) return false;
  return isPublicProfileVisible(supabase, post.user_id);
}
