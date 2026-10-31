import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const noStore = { 'Cache-Control': 'no-store' };
const fields = ['designer_portfolio_enabled', 'reviewer_portfolio_enabled', 'beta_reader_portfolio_enabled', 'translator_portfolio_enabled', 'available_for_design_requests'] as const;

export async function GET() {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: noStore });
    const { data, error } = await supabase.from('profiles').select(fields.join(',')).eq('id', user.userId).maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404, headers: noStore });
    return NextResponse.json({ settings: data }, { headers: noStore });
  } catch (error) {
    console.error('GET /api/account/credits:', error);
    return NextResponse.json({ error: 'Não foi possível carregar as preferências de créditos.' }, { status: 500, headers: noStore });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: noStore });
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.entries(body).some(([key, value]) => !(fields as readonly string[]).includes(key) || typeof value !== 'boolean')) {
      return NextResponse.json({ error: 'Preferências inválidas.' }, { status: 400, headers: noStore });
    }
    if (Object.keys(body).length === 0) return NextResponse.json({ error: 'Nenhuma preferência informada.' }, { status: 400, headers: noStore });
    const { data, error } = await supabase.from('profiles').update(body).eq('id', user.userId).select(fields.join(',')).single();
    if (error) throw error;
    return NextResponse.json({ settings: data }, { headers: noStore });
  } catch (error) {
    console.error('PATCH /api/account/credits:', error);
    return NextResponse.json({ error: 'Não foi possível salvar as preferências de créditos.' }, { status: 500, headers: noStore });
  }
}
