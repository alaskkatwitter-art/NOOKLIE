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
    const now = new Date().toISOString();
    const { data: opportunities, error } = await supabase.from('opportunities')
      .select('id, department_id, title, description, requirements, openings, questions, opens_at, closes_at')
      .eq('status', 'open')
      .lte('opens_at', now)
      .gt('closes_at', now)
      .order('closes_at', { ascending: true });
    if (error) throw error;

    const departmentIds = Array.from(new Set((opportunities || []).map((item) => item.department_id)));
    const { data: departments, error: departmentError } = departmentIds.length
      ? await supabase.from('departments').select('id, name').in('id', departmentIds)
      : { data: [], error: null };
    if (departmentError) throw departmentError;

    return NextResponse.json({
      opportunities: (opportunities || []).map((item) => ({
        ...item,
        department: (departments || []).find((department) => department.id === item.department_id) || null,
      })),
    }, { headers: noStore });
  } catch (error) {
    console.error('GET /api/opportunities:', error);
    return NextResponse.json({ error: 'Não foi possível carregar as oportunidades.' }, { status: 500, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta para se candidatar.' }, { status: 401, headers: noStore });
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.opportunity_id !== 'string') {
      return NextResponse.json({ error: 'Dados da candidatura inválidos.' }, { status: 400, headers: noStore });
    }
    const answers = body.answers;
    if (!answers || typeof answers !== 'object' || Array.isArray(answers) ||
        Object.values(answers).some((value) => typeof value !== 'string' || value.length > 8000) ||
        JSON.stringify(answers).length > 45000) {
      return NextResponse.json({ error: 'Confira as respostas do formulário.' }, { status: 400, headers: noStore });
    }

    const { data, error } = await supabase.rpc('submit_opportunity_application', {
      p_session_token_hash: user.sessionTokenHash,
      p_opportunity_id: body.opportunity_id,
      p_answers: answers,
    });
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Você já enviou uma candidatura para esta vaga.' }, { status: 409, headers: noStore });
      if (error.code === 'P0002') return NextResponse.json({ error: 'Esta vaga não está recebendo candidaturas.' }, { status: 404, headers: noStore });
      if (error.code?.startsWith('22')) return NextResponse.json({ error: 'Responda às perguntas obrigatórias e tente novamente.' }, { status: 400, headers: noStore });
      console.error('POST /api/opportunities:', error);
      return NextResponse.json({ error: 'Não foi possível enviar a candidatura.' }, { status: 500, headers: noStore });
    }
    return NextResponse.json({ id: data, status: 'submitted' }, { status: 201, headers: noStore });
  } catch (error) {
    console.error('POST /api/opportunities:', error);
    return NextResponse.json({ error: 'Não foi possível enviar a candidatura.' }, { status: 500, headers: noStore });
  }
}
