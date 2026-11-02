import type { SupabaseClient } from '@supabase/supabase-js';

export async function areUsersBlocked(client: SupabaseClient, firstProfileId: string, secondProfileId: string) {
  if (!firstProfileId || !secondProfileId || firstProfileId === secondProfileId) return false;
  const [forward, reverse] = await Promise.all([
    client.from('user_blocks').select('id').eq('blocker_id', firstProfileId).eq('blocked_id', secondProfileId).maybeSingle(),
    client.from('user_blocks').select('id').eq('blocker_id', secondProfileId).eq('blocked_id', firstProfileId).maybeSingle(),
  ]);
  if (forward.error) throw forward.error;
  if (reverse.error) throw reverse.error;
  return Boolean(forward.data || reverse.data);
}
