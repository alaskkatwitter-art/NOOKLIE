import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

type VisibilityClient = SupabaseClient;

export async function currentViewerProfileId(supabase:VisibilityClient):Promise<string|null>{
 const auth=await getAuthenticatedUserContext();if(!auth)return null;
 const account=await supabase.from('auth_accounts').select('account_status').eq('id',auth.userId).maybeSingle();if(account.error)throw account.error;if(!account.data||account.data.account_status==='suspended')return null;
 const {data,error}=await supabase.from('profiles').select('id').eq('user_id',auth.userId).maybeSingle();if(error)throw error;return data?.id||null;
}

export async function isPublicProfileVisible(
  supabase: VisibilityClient,
  profileOrUserId: string,
  viewerId?: string|null,
  basicOnly=false
): Promise<boolean> {
  let { data: profile, error } = await supabase
    .from('profiles')
    .select('id, user_id, moderation_hidden_at, is_private')
    .eq('id', profileOrUserId)
    .maybeSingle();
  if (error) throw error;
  if (!profile) {
    const fallback = await supabase
      .from('profiles')
      .select('id, user_id, moderation_hidden_at, is_private')
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
  if(account?.account_status==='suspended')return false;
  if(basicOnly)return true;
  const viewer=viewerId===undefined?await currentViewerProfileId(supabase):viewerId;
  if(viewer&&viewer!==profile.id){const blocks=await supabase.from('chat_blocks').select('blocker_id').or(`and(blocker_id.eq.${viewer},blocked_id.eq.${profile.id}),and(blocker_id.eq.${profile.id},blocked_id.eq.${viewer})`).limit(1);if(blocks.error)throw blocks.error;if(blocks.data?.length)return false;}
  if(!profile.is_private)return true;
  if(viewer===profile.id)return true;if(!viewer)return false;
  const follow=await supabase.from('follows').select('follower_id').eq('follower_id',viewer).eq('following_id',profile.id).maybeSingle();if(follow.error)throw follow.error;return Boolean(follow.data);
}

export async function isAccountVisible(supabase:VisibilityClient,id:string){return isPublicProfileVisible(supabase,id,null,true);}

export async function getPublicProfileIds(
  supabase: VisibilityClient,
  profileOrUserIds: string[],
  viewerProfileId?: string | null
): Promise<Set<string>> {
  const identifiers = Array.from(new Set(profileOrUserIds.filter(Boolean)));
  if (identifiers.length === 0) return new Set();

  const [profilesById, profilesByUserId] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, user_id, moderation_hidden_at, is_private')
      .in('id', identifiers),
    supabase
      .from('profiles')
      .select('id, user_id, moderation_hidden_at, is_private')
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

  const privateIds=profiles.filter(p=>p.is_private).map(p=>p.id);
  const viewer=viewerProfileId === undefined ? await currentViewerProfileId(supabase) : viewerProfileId;const followed=new Set<string>();
  const blocked=new Set<string>();
  if(viewer){const blocks=await supabase.from('chat_blocks').select('blocker_id,blocked_id').or(`blocker_id.eq.${viewer},blocked_id.eq.${viewer}`);if(blocks.error)throw blocks.error;for(const b of blocks.data||[])blocked.add(b.blocker_id===viewer?b.blocked_id:b.blocker_id);}
  if(privateIds.length){if(viewer){const follows=await supabase.from('follows').select('following_id').eq('follower_id',viewer).in('following_id',privateIds);if(follows.error)throw follows.error;for(const f of follows.data||[])followed.add(f.following_id);}}
  return new Set(
    profiles
      .filter((profile) => !suspendedUserIds.has(profile.user_id)&&!blocked.has(profile.id)&&(!profile.is_private||profile.id===viewer||followed.has(profile.id)))
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
