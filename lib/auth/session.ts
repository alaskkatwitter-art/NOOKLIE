import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export type AuthenticatedUserContext = {
  userId: string;
  sessionTokenHash: string;
};

export async function getAuthenticatedUserContext(options: { allowDeactivated?: boolean } = {}): Promise<AuthenticatedUserContext | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('toriland_session')?.value;
  if (!sessionToken) return null;

  const sessionTokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
  const { data: session, error } = await supabase
    .from('auth_sessions')
    .select('user_id, expires_at')
    .eq('token_hash', sessionTokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!session || new Date(session.expires_at).getTime() <= Date.now()) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('deactivated_at')
    .eq('user_id', session.user_id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || (profile.deactivated_at && !options.allowDeactivated)) return null;

  return { userId: session.user_id as string, sessionTokenHash };
}
