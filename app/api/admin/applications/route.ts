import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getStaffContext,
  hasStaffPermission,
  staffPermissionErrorResponse,
} from '@/lib/admin/authorization';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);
const noStore = { 'Cache-Control': 'no-store' };

function dbError(error: { code?: string; message?: string }, label: string) {
  if (error.code === '42501') return NextResponse.json({ error: 'Você não tem permissão para esta ação.' }, { status: 403, headers: noStore });
  if (error.code === 'P0002') return NextResponse.json({ error: 'Candidatura não encontrada.' }, { status: 404, headers: noStore });
  if (error.code?.startsWith('22')) return NextResponse.json({ error: 'Confira o status, as observações e o cargo escolhido.' }, { status: 400, headers: noStore });
  console.error(label, error);
  return NextResponse.json({ error: 'Não foi possível concluir a análise.' }, { status: 500, headers: noStore });
}

export async function GET() {
  try {
    const staff = await getStaffContext();
    if (!staff) return staffPermissionErrorResponse(401);
    const hasView = await hasStaffPermission(staff, 'applications.view');
    const hasReview = await hasStaffPermission(staff, 'applications.review');
    if (!hasView && !hasReview) return staffPermissionErrorResponse(403);
    const departmentIds = staff.isPlatformAdmin ? [] : (await Promise.all(
      staff.memberships.map(async (membership) => ({
        id: membership.department_id,
        allowed: await hasStaffPermission(staff, 'applications.view', membership.department_id) ||
          await hasStaffPermission(staff, 'applications.review', membership.department_id),
      }))
    )).filter((item) => item.allowed).map((item) => item.id);
    let opportunityQuery = supabase.from('opportunities').select('id, department_id, title, questions');
    if (!staff.isPlatformAdmin) {
      if (!departmentIds.length) return NextResponse.json({ applications: [] }, { headers: noStore });
      opportunityQuery = opportunityQuery.in('department_id', departmentIds);
    }
    const { data: opportunities, error: opportunityError } = await opportunityQuery;
    if (opportunityError) throw opportunityError;
    const opportunityIds = (opportunities || []).map((item) => item.id);
    if (!opportunityIds.length) return NextResponse.json({ applications: [] }, { headers: noStore });

    const { data: applications, error } = await supabase.from('applications')
      .select('id, opportunity_id, user_id, answers, status, internal_notes, reviewer_id, reviewed_at, created_at, updated_at')
      .in('opportunity_id', opportunityIds)
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) throw error;
    const userIds = Array.from(new Set((applications || []).map((item) => item.user_id)));
    const { data: profiles, error: profilesError } = userIds.length
      ? await supabase.from('profiles').select('user_id, username, display_name, avatar_url').in('user_id', userIds)
      : { data: [], error: null };
    if (profilesError) throw profilesError;

    return NextResponse.json({
      applications: (applications || []).map((application) => ({
        ...application,
        applicant: (profiles || []).find((profile) => profile.user_id === application.user_id) || null,
        opportunity: (opportunities || []).find((opportunity) => opportunity.id === application.opportunity_id) || null,
      })),
    }, { headers: noStore });
  } catch (error) {
    console.error('GET /api/admin/applications:', error);
    return NextResponse.json({ error: 'Não foi possível carregar as candidaturas.' }, { status: 500, headers: noStore });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const staff = await getStaffContext();
    if (!staff) return staffPermissionErrorResponse(401);
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        typeof body.id !== 'string' ||
        !['in_review', 'approved', 'rejected'].includes(body.status)) {
      return NextResponse.json({ error: 'Dados de análise inválidos.' }, { status: 400, headers: noStore });
    }
    if ((body.status === 'approved' || body.status === 'rejected') && body.confirm !== true) {
      return NextResponse.json({ error: 'Confirme a decisão final.' }, { status: 400, headers: noStore });
    }
    const { data: application, error: applicationError } = await supabase.from('applications')
      .select('id, opportunity_id')
      .eq('id', body.id)
      .maybeSingle();
    if (applicationError) throw applicationError;
    if (!application) return NextResponse.json({ error: 'Candidatura não encontrada.' }, { status: 404, headers: noStore });
    const { data: opportunity, error: opportunityError } = await supabase.from('opportunities')
      .select('department_id')
      .eq('id', application.opportunity_id)
      .maybeSingle();
    if (opportunityError) throw opportunityError;
    if (!opportunity) return NextResponse.json({ error: 'Vaga não encontrada.' }, { status: 404, headers: noStore });

    if (!(await hasStaffPermission(staff, 'applications.review', opportunity.department_id))) return staffPermissionErrorResponse(403);
    if (body.status === 'approved' &&
        !(await hasStaffPermission(staff, 'members.manage', opportunity.department_id))) return staffPermissionErrorResponse(403);

    const notes = typeof body.internal_notes === 'string' ? body.internal_notes.trim() : '';
    if (notes.length > 8000) return NextResponse.json({ error: 'As observações podem ter até 8.000 caracteres.' }, { status: 400, headers: noStore });
    if (body.status === 'approved' && typeof body.role_id !== 'string') return NextResponse.json({ error: 'Escolha um cargo para nomear a pessoa aprovada.' }, { status: 400, headers: noStore });
    if (body.status !== 'approved' && body.role_id != null) return NextResponse.json({ error: 'O cargo só pode ser escolhido ao aprovar.' }, { status: 400, headers: noStore });

    const { data, error } = await supabase.rpc('admin_review_application', {
      p_session_token_hash: staff.sessionTokenHash,
      p_application_id: body.id,
      p_status: body.status,
      p_internal_notes: notes,
      p_role_id: body.status === 'approved' ? body.role_id : null,
    });
    if (error) return dbError(error, 'PATCH /api/admin/applications');
    return NextResponse.json({ updated: Boolean(data) }, { headers: noStore });
  } catch (error) {
    console.error('PATCH /api/admin/applications:', error);
    return NextResponse.json({ error: 'Não foi possível concluir a análise.' }, { status: 500, headers: noStore });
  }
}
