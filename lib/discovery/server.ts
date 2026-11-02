import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

export const discoveryDb = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
export const privateHeaders = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getDiscoveryReader() {
  const account = await getAuthenticatedUserContext();
  if (!account) return null;
  const [profile, status] = await Promise.all([
    discoveryDb.from('profiles').select('id, username, display_name, avatar_url, moderation_hidden_at').eq('user_id', account.userId).maybeSingle(),
    discoveryDb.from('auth_accounts').select('account_status').eq('id', account.userId).maybeSingle(),
  ]);
  if (profile.error || status.error) throw profile.error || status.error;
  if (!profile.data || !status.data || profile.data.moderation_hidden_at || status.data.account_status === 'suspended') return null;
  return { accountId: account.userId, profile: profile.data };
}
