import { getD1PreviewDatabase } from '@/lib/database/preview';
import { uuid } from '@/lib/chat/server';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);
const noStore = { 'Cache-Control': 'no-store' };
const accepting = "o.status='open' AND julianday(o.opens_at)<=julianday('now') AND julianday(o.closes_at)>julianday('now')";

export async function GET() {
  try {
    const db = getD1PreviewDatabase('auth');
    if (db) {
      const result = await db.prepare(`SELECT o.id,o.department_id,o.title,o.description,o.requirements,
        o.openings,o.questions,o.opens_at,o.closes_at,d.name AS department_name FROM opportunities o
        LEFT JOIN departments d ON d.id=o.department_id WHERE ${accepting} ORDER BY julianday(o.closes_at),o.id`)
        .all<{ department_id: string; department_name: string | null; questions: string }>();
      if (!result.success) throw Error('Opportunities unavailable');
      return NextResponse.json({ opportunities: result.results.map(({ department_name, questions, ...row }) => ({
        ...row, questions: JSON.parse(questions), department: department_name === null
          ? null : { id: row.department_id, name: department_name },
      })) }, { headers: noStore });
    }
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

    const db = getD1PreviewDatabase('auth');
    if (db) {
      const opportunityId = body.opportunity_id.toLowerCase();
      const opportunity = uuid.test(opportunityId) ? await db.prepare(`SELECT o.questions FROM opportunities o
        WHERE o.id=? AND ${accepting}`).bind(opportunityId).first<{ questions: string }>() : null;
      const closed = () => NextResponse.json({ error: 'Esta vaga não está recebendo candidaturas.' }, { status: 404, headers: noStore });
      if (!opportunity) return closed();
      const questions = JSON.parse(opportunity.questions) as { id: string; required?: boolean }[];
      const allowed = new Set(questions.map(question => question.id));
      if (Object.keys(answers).some(key => !allowed.has(key)) ||
          questions.some(question => question.required &&
            (!Object.hasOwn(answers, question.id) || !answers[question.id].trim()))) {
        return NextResponse.json({ error: 'Responda às perguntas obrigatórias e tente novamente.' }, { status: 400, headers: noStore });
      }
      const id = crypto.randomUUID();
      const insert = db.prepare(`INSERT INTO applications(id,opportunity_id,user_id,answers)
        SELECT ?1,o.id,a.user_id,?2 FROM opportunities o JOIN d1_mod_actor a ON a.token_hash=?3
        WHERE o.id=?4 AND ${accepting} AND o.questions=?5
        ON CONFLICT(opportunity_id,user_id) DO NOTHING`)
        .bind(id,JSON.stringify(answers),user.sessionTokenHash,opportunityId,opportunity.questions);
      const audit = db.prepare(`INSERT INTO admin_audit_log(id,actor_user_id,action,subject_type,subject_id,details)
        SELECT ?2,user_id,'application.submitted','application',id,json_object('opportunity_id',opportunity_id)
        FROM applications WHERE id=?1 AND changes()=1`).bind(id,crypto.randomUUID());
      const result = await db.batch([insert,audit]);
      if (result.some(row => !row.success)) throw Error('Application could not be saved');
      if (result[0].meta.changes) return NextResponse.json({ id, status: 'submitted' }, { status: 201, headers: noStore });
      const duplicate = await db.prepare('SELECT id FROM applications WHERE opportunity_id=? AND user_id=?')
        .bind(opportunityId,user.userId).first();
      if (duplicate) return NextResponse.json({ error: 'Você já enviou uma candidatura para esta vaga.' }, { status: 409, headers: noStore });
      return closed();
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
