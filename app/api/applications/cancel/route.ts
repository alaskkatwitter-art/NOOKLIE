import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const body = await request.json();
    if (typeof body?.application_id !== 'string') return NextResponse.json({ error: 'Candidatura inválida.' }, { status: 400 });
    const { error } = await supabase.rpc('cancel_own_application', {
      p_session_token_hash: user.sessionTokenHash,
      p_application_id: body.application_id,
    });
    if (error) {
      if (error.code === 'P0002') return NextResponse.json({ error: 'Candidatura não encontrada.' }, { status: 404 });
      if (error.code?.startsWith('22')) return NextResponse.json({ error: 'Esta candidatura já não pode ser cancelada.' }, { status: 409 });
      console.error('POST /api/applications/cancel:', error);
      return NextResponse.json({ error: 'Não foi possível cancelar a candidatura.' }, { status: 500 });
    }
    return NextResponse.json({ cancelled: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('POST /api/applications/cancel:', error);
    return NextResponse.json({ error: 'Não foi possível cancelar a candidatura.' }, { status: 500 });
  }
}
