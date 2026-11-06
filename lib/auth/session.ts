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

export async function getSessionTokenHash(): Promise<string | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('toriland_session')?.value;
  return sessionToken ? crypto.createHash('sha256').update(sessionToken).digest('hex') : null;
}

export async function getAuthenticatedUserContext(): Promise<AuthenticatedUserContext | null> {
  const sessionTokenHash = await getSessionTokenHash();
  if (!sessionTokenHash) return null;
  const { data: session, error } = await supabase
    .from('auth_sessions')
    .select('user_id, expires_at')
    .eq('token_hash', sessionTokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!session || new Date(session.expires_at).getTime() <= Date.now()) return null;

  return { userId: session.user_id as string, sessionTokenHash };
}
