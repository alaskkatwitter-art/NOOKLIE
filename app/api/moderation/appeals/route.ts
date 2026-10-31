import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta para consultar decisões de moderação.' }, { status: 401, headers: noStore });
    const { data: actions, error } = await supabase.from('moderation_actions')
      .select('id, action_type, reason, starts_at, ends_at, appeal_status, created_at')
      .eq('target_profile_id', user.userId).order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    const actionIds = (actions || []).map((action) => action.id);
    const { data: appeals, error: appealError } = actionIds.length
      ? await supabase.from('moderation_appeals').select('id, moderation_action_id, details, status, created_at, reviewed_at').in('moderation_action_id', actionIds)
      : { data: [], error: null };
    if (appealError) throw appealError;
    return NextResponse.json({ decisions: (actions || []).map((action) => ({ ...action, appeal: (appeals || []).find((appeal) => appeal.moderation_action_id === action.id) || null })) }, { headers: noStore });
  } catch (error) {
    console.error('GET /api/moderation/appeals:', error);
    return NextResponse.json({ error: 'Não foi possível carregar as decisões.' }, { status: 500, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta para enviar um recurso.' }, { status: 401, headers: noStore });
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.action_id !== 'string' || typeof body.details !== 'string' || body.details.trim().length < 1 || body.details.trim().length > 5000) {
      return NextResponse.json({ error: 'Explique o motivo do recurso em até 5.000 caracteres.' }, { status: 400, headers: noStore });
    }
    const { data, error } = await supabase.rpc('submit_moderation_appeal', {
      p_session_token_hash: user.sessionTokenHash, p_action_id: body.action_id, p_details: body.details.trim(),
    });
    if (error) {
      if (error.code === '42501') return NextResponse.json({ error: 'Esta decisão não pode ser contestada por esta conta.' }, { status: 403, headers: noStore });
      if (error.code === '23505') return NextResponse.json({ error: 'Já existe um recurso para esta decisão.' }, { status: 409, headers: noStore });
      if (error.code?.startsWith('22')) return NextResponse.json({ error: 'Esta decisão não aceita novos recursos.' }, { status: 409, headers: noStore });
      throw error;
    }
    return NextResponse.json({ appeal_id: data }, { status: 201, headers: noStore });
  } catch (error) {
    console.error('POST /api/moderation/appeals:', error);
    return NextResponse.json({ error: 'Não foi possível enviar o recurso.' }, { status: 500, headers: noStore });
  }
}
