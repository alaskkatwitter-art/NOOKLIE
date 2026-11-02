import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: noStore });
    const { data, error } = await supabase.from('user_blocks')
      .select('id, created_at, blocked:profiles!user_blocks_blocked_id_fkey(id, username, display_name, avatar_url)')
      .eq('blocker_id', user.userId).order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json({ blocks: (data || []).map((row) => ({ id: row.id, created_at: row.created_at, profile: Array.isArray(row.blocked) ? row.blocked[0] : row.blocked })) }, { headers: noStore });
  } catch (error) {
    console.error('GET /api/user-blocks:', error);
    return NextResponse.json({ error: 'Não foi possível carregar a lista de bloqueios.' }, { status: 500, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: noStore });
    const body = await request.json();
    const username = typeof body?.username === 'string' ? body.username.trim().replace(/^@/, '').toLowerCase() : '';
    if (!/^[a-z0-9_]{3,30}$/.test(username)) return NextResponse.json({ error: 'Informe um @usuário válido.' }, { status: 400, headers: noStore });
    const { data: target, error: profileError } = await supabase.from('profiles').select('id, username').eq('username', username).maybeSingle();
    if (profileError) throw profileError;
    if (!target) return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404, headers: noStore });
    if (target.id === user.userId) return NextResponse.json({ error: 'Você não pode bloquear sua própria conta.' }, { status: 400, headers: noStore });
    const { data, error } = await supabase.from('user_blocks').upsert({ blocker_id: user.userId, blocked_id: target.id }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true }).select('id').maybeSingle();
    if (error) throw error;
    return NextResponse.json({ blocked: true, username: target.username, id: data?.id || null }, { status: 201, headers: noStore });
  } catch (error) {
    console.error('POST /api/user-blocks:', error);
    return NextResponse.json({ error: 'Não foi possível bloquear este perfil.' }, { status: 500, headers: noStore });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: noStore });
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Bloqueio não informado.' }, { status: 400, headers: noStore });
    const { error } = await supabase.from('user_blocks').delete().eq('id', id).eq('blocker_id', user.userId);
    if (error) throw error;
    return NextResponse.json({ blocked: false }, { headers: noStore });
  } catch (error) {
    console.error('DELETE /api/user-blocks:', error);
    return NextResponse.json({ error: 'Não foi possível desbloquear este perfil.' }, { status: 500, headers: noStore });
  }
}
