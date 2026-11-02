import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);
const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta para consultar os pedidos.' }, { status: 401, headers: noStore });
    const { data, error } = await supabase.from('content_warning_corrections')
      .select('id, story_id, missing_warnings, notice, due_at, author_response, status, created_at, submitted_at, decided_at, decision')
      .eq('author_user_id', user.userId).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    const storyIds = Array.from(new Set((data || []).map((item) => item.story_id)));
    const { data: stories, error: storyError } = storyIds.length
      ? await supabase.from('stories').select('id, title').in('id', storyIds)
      : { data: [], error: null };
    if (storyError) throw storyError;
    return NextResponse.json({ requests: (data || []).map((item) => ({
      ...item,
      overdue: item.status === 'requested' && new Date(item.due_at).getTime() < Date.now(),
      story: stories?.find((story) => story.id === item.story_id) || null,
    })) }, { headers: noStore });
  } catch (error) {
    console.error('GET /api/account/content-warning-corrections:', error);
    return NextResponse.json({ error: 'Não foi possível carregar seus pedidos de correção.' }, { status: 500, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta para responder ao pedido.' }, { status: 401, headers: noStore });
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.id !== 'string' || typeof body.author_response !== 'string') {
      return NextResponse.json({ error: 'Resposta inválida.' }, { status: 400, headers: noStore });
    }
    const response = body.author_response.trim();
    if (!response || response.length > 2000) return NextResponse.json({ error: 'Explique o ajuste em até 2.000 caracteres.' }, { status: 400, headers: noStore });
    const { data, error } = await supabase.rpc('submit_content_warning_correction', {
      p_session_token_hash: user.sessionTokenHash, p_correction_id: body.id, p_author_response: response,
    });
    if (error) {
      if (error.code === 'P0002') return NextResponse.json({ error: 'Pedido não encontrado ou já respondido.' }, { status: 404, headers: noStore });
      if (error.code === '22023') return NextResponse.json({ error: 'Escreva uma resposta antes de enviar.' }, { status: 400, headers: noStore });
      throw error;
    }
    return NextResponse.json({ submitted: Boolean(data) }, { headers: noStore });
  } catch (error) {
    console.error('POST /api/account/content-warning-corrections:', error);
    return NextResponse.json({ error: 'Não foi possível enviar a resposta.' }, { status: 500, headers: noStore });
  }
}
