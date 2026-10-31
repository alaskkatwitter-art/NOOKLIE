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

export async function getPublicProfileIds(
  supabase: VisibilityClient,
  profileOrUserIds: string[]
): Promise<Set<string>> {
  const identifiers = Array.from(new Set(profileOrUserIds.filter(Boolean)));
  if (identifiers.length === 0) return new Set();

  const [profilesById, profilesByUserId] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, user_id, moderation_hidden_at')
      .in('id', identifiers),
    supabase
      .from('profiles')
      .select('id, user_id, moderation_hidden_at')
      .in('user_id', identifiers),
  ]);

  if (profilesById.error) throw profilesById.error;
  if (profilesByUserId.error) throw profilesByUserId.error;

  const profiles = Array.from(
    new Map(
      [...(profilesById.data || []), ...(profilesByUserId.data || [])]
        .map((profile) => [profile.user_id, profile] as const)
    ).values()
  ).filter((profile) => !profile.moderation_hidden_at);

  if (profiles.length === 0) return new Set();

  const userIds = profiles.map((profile) => profile.user_id);
  const { data: accounts, error: accountError } = await supabase
    .from('auth_accounts')
    .select('id, account_status')
    .in('id', userIds);

  if (accountError) throw accountError;

  const suspendedUserIds = new Set(
    (accounts || [])
      .filter((account) => account.account_status === 'suspended')
      .map((account) => account.id)
  );

  return new Set(
    profiles
      .filter((profile) => !suspendedUserIds.has(profile.user_id))
      .flatMap((profile) => [profile.id, profile.user_id])
  );
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
