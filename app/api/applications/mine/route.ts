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
