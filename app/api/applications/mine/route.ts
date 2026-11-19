import { getD1PreviewDatabase } from '@/lib/database/preview';
import { NextResponse } from 'next/server';
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
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: noStore });
    const db = getD1PreviewDatabase('auth');
    if (db) {
      const result = await db.prepare(`SELECT x.id,x.opportunity_id,x.answers,x.status,x.created_at,x.updated_at,
        CASE WHEN o.id IS NULL THEN NULL ELSE json_object('id',o.id,'title',o.title,'department_id',o.department_id,
          'department',CASE WHEN d.id IS NOT NULL THEN json_object('id',d.id,'name',d.name) END) END AS opportunity
        FROM applications x JOIN d1_social_actors a ON a.user_id=x.user_id
        LEFT JOIN opportunities o ON o.id=x.opportunity_id LEFT JOIN departments d ON d.id=o.department_id
        WHERE a.token_hash=? ORDER BY x.created_at DESC,x.id`).bind(user.sessionTokenHash)
        .all<{answers:string;opportunity:string|null}>();
      if (!result.success) throw Error('Unable to read applications');
      return NextResponse.json({applications:result.results.map(row=>({
        ...row,answers:JSON.parse(row.answers),opportunity:row.opportunity ? JSON.parse(row.opportunity) : null,
      }))},{headers:noStore});
    }
    const { data, error } = await supabase.from('applications')
      .select('id, opportunity_id, answers, status, created_at, updated_at')
      .eq('user_id', user.userId)
      .order('created_at', { ascending: false });
    if (error) throw error;

    const opportunityIds = Array.from(new Set((data || []).map((application) => application.opportunity_id)));
    const { data: opportunities, error: opportunityError } = opportunityIds.length
      ? await supabase.from('opportunities').select('id, title, department_id').in('id', opportunityIds)
      : { data: [], error: null };
    if (opportunityError) throw opportunityError;

    const departmentIds = Array.from(new Set((opportunities || []).map((opportunity) => opportunity.department_id)));
    const { data: departments, error: departmentError } = departmentIds.length
      ? await supabase.from('departments').select('id, name').in('id', departmentIds)
      : { data: [], error: null };
    if (departmentError) throw departmentError;

    return NextResponse.json({
      applications: (data || []).map((application) => {
        const opportunity = (opportunities || []).find((item) => item.id === application.opportunity_id) || null;
        return {
          ...application,
          opportunity: opportunity ? {
            ...opportunity,
            department: (departments || []).find((department) => department.id === opportunity.department_id) || null,
          } : null,
        };
      }),
    }, { headers: noStore });
  } catch (error) {
    console.error('GET /api/applications/mine:', error);
    return NextResponse.json({ error: 'Não foi possível carregar suas candidaturas.' }, { status: 500, headers: noStore });
  }
}
