import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

export async function GET() {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401 });
    const { data, error } = await supabase.from('collaborator_invites')
      .select('id, story_id, role, status, created_at, inviter:profiles!collaborator_invites_inviter_id_fkey(username, display_name), story:stories!collaborator_invites_story_id_fkey(title)')
      .eq('invitee_id', user.userId).eq('status', 'pending').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    return NextResponse.json({ invites: (data || []).map((row) => ({ ...row, inviter: Array.isArray(row.inviter) ? row.inviter[0] : row.inviter, story: Array.isArray(row.story) ? row.story[0] : row.story })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/collaborator-invites:', error);
    return NextResponse.json({ error: 'Não foi possível carregar os convites.' }, { status: 500 });
  }
}
