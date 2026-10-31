import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const noStore = { 'Cache-Control': 'no-store' };
const roles = new Set(['coauthor', 'designer', 'reviewer', 'beta_reader', 'translator']);

export async function GET() {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: noStore });

    const { data, error } = await supabase.from('story_collaborators')
      .select('id, story_id, role, accepted_at, story:stories!story_collaborators_story_id_fkey(title)')
      .eq('profile_id', user.userId).eq('status', 'active').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;

    const collaborations = (data || []).map((row) => ({
      id: row.id,
      story_id: row.story_id,
      role: row.role,
      accepted_at: row.accepted_at,
      story_title: Array.isArray(row.story) ? row.story[0]?.title || 'História sem título' : row.story?.title || 'História sem título',
    }));
    return NextResponse.json({ collaborations }, { headers: noStore });
  } catch (error) {
    console.error('GET /api/account/collaborations:', error);
    return NextResponse.json({ error: 'Não foi possível carregar suas colaborações.' }, { status: 500, headers: noStore });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: noStore });

    const body = await request.json();
    if (!body || typeof body !== 'object' || typeof body.story_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.story_id) || typeof body.role !== 'string' || !roles.has(body.role)) {
      return NextResponse.json({ error: 'Selecione uma colaboração válida.' }, { status: 400, headers: noStore });
    }

    const { data, error } = await supabase.rpc('leave_story_collaboration', {
      p_session_token_hash: user.sessionTokenHash,
      p_story_id: body.story_id,
      p_role: body.role,
    });
    if (error) {
      if (error.code === '42501') return NextResponse.json({ error: 'Sua sessão não permite esta ação.' }, { status: 401, headers: noStore });
      if (error.code === '22023') return NextResponse.json({ error: 'Função de colaboração inválida.' }, { status: 400, headers: noStore });
      if (error.code === 'P0002') return NextResponse.json({ error: 'Esta colaboração já foi encerrada.' }, { status: 404, headers: noStore });
      throw error;
    }

    return NextResponse.json({ left: Boolean(data?.left), role: data?.role }, { headers: noStore });
  } catch (error) {
    console.error('DELETE /api/account/collaborations:', error);
    return NextResponse.json({ error: 'Não foi possível encerrar a colaboração.' }, { status: 500, headers: noStore });
  }
}
