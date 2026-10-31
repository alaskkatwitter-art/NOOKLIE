import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStaffContext, hasStaffPermission, staffPermissionErrorResponse } from '@/lib/admin/authorization';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    const staff = await getStaffContext();
    if (!staff) return staffPermissionErrorResponse(401);
    if (!staff.isPlatformAdmin && !(await hasStaffPermission(staff, 'moderation.appeals.manage'))) return staffPermissionErrorResponse(403);
    const departmentIds = new Set<string>();
    if (!staff.isPlatformAdmin) {
      for (const membership of staff.memberships) if (await hasStaffPermission(staff, 'moderation.appeals.manage', membership.department_id)) departmentIds.add(membership.department_id);
    }
    const { data: appeals, error } = await supabase.from('moderation_appeals')
      .select('id, moderation_action_id, appellant_id, details, status, internal_notes, created_at, reviewed_at')
      .order('created_at', { ascending: false }).limit(300);
    if (error) throw error;
    const actionIds = Array.from(new Set((appeals || []).map((appeal) => appeal.moderation_action_id)));
    const { data: actions, error: actionError } = actionIds.length
      ? await supabase.from('moderation_actions').select('id, target_profile_id, report_id, action_type, reason, starts_at, ends_at').in('id', actionIds)
      : { data: [], error: null };
    if (actionError) throw actionError;
    const reportIds = Array.from(new Set((actions || []).flatMap((action) => action.report_id ? [action.report_id] : [])));
    const { data: reports, error: reportError } = reportIds.length
      ? await supabase.from('moderation_reports').select('id, department_id').in('id', reportIds)
      : { data: [], error: null };
    if (reportError) throw reportError;
    const visible = (appeals || []).filter((appeal) => {
      const action = (actions || []).find((item) => item.id === appeal.moderation_action_id);
      if (!action) return false;
      if (staff.isPlatformAdmin) return true;
      const department = (reports || []).find((report) => report.id === action.report_id)?.department_id;
      return Boolean(department && departmentIds.has(department));
    });
    const userIds = Array.from(new Set(visible.flatMap((appeal) => [appeal.appellant_id, (actions || []).find((item) => item.id === appeal.moderation_action_id)?.target_profile_id].filter(Boolean) as string[])));
    const { data: profiles, error: profileError } = userIds.length
      ? await supabase.from('profiles').select('id, username, display_name').in('id', userIds)
      : { data: [], error: null };
    if (profileError) throw profileError;
    return NextResponse.json({ appeals: visible.map((appeal) => {
      const action = (actions || []).find((item) => item.id === appeal.moderation_action_id)!;
      return { ...appeal, action, appellant: (profiles || []).find((profile) => profile.id === appeal.appellant_id) || null };
    }) }, { headers: noStore });
  } catch (error) {
    console.error('GET /api/admin/appeals:', error);
    return NextResponse.json({ error: 'Não foi possível carregar os recursos.' }, { status: 500, headers: noStore });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const staff = await getStaffContext();
    if (!staff) return staffPermissionErrorResponse(401);
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.id !== 'string' || !['in_review', 'accepted', 'rejected'].includes(body.status) || (body.status !== 'in_review' && body.confirm !== true)) {
      return NextResponse.json({ error: 'Confirme a decisão e informe um estado válido.' }, { status: 400, headers: noStore });
    }
    const notes = typeof body.internal_notes === 'string' ? body.internal_notes.trim() : '';
    if (notes.length > 8000) return NextResponse.json({ error: 'As observações podem ter até 8.000 caracteres.' }, { status: 400, headers: noStore });
    const { data: appeal, error: appealError } = await supabase.from('moderation_appeals').select('moderation_action_id').eq('id', body.id).maybeSingle();
    if (appealError) throw appealError;
    if (!appeal) return NextResponse.json({ error: 'Recurso não encontrado.' }, { status: 404, headers: noStore });
    const { data: action, error: actionError } = await supabase.from('moderation_actions').select('report_id').eq('id', appeal.moderation_action_id).maybeSingle();
    if (actionError) throw actionError;
    const { data: report, error: reportError } = action?.report_id
      ? await supabase.from('moderation_reports').select('department_id').eq('id', action.report_id).maybeSingle()
      : { data: null, error: null };
    if (reportError) throw reportError;
    if (report?.department_id) {
      if (!(await hasStaffPermission(staff, 'moderation.appeals.manage', report.department_id))) return staffPermissionErrorResponse(403);
    } else if (!staff.isPlatformAdmin) return staffPermissionErrorResponse(403);
    const { error } = await supabase.rpc('admin_review_moderation_appeal', {
      p_session_token_hash: staff.sessionTokenHash, p_appeal_id: body.id, p_status: body.status, p_internal_notes: notes,
    });
    if (error) {
      if (error.code === '42501') return staffPermissionErrorResponse(403);
      if (error.code === 'P0002') return NextResponse.json({ error: 'Este recurso já foi decidido ou não está disponível.' }, { status: 409, headers: noStore });
      throw error;
    }
    return NextResponse.json({ updated: true }, { headers: noStore });
  } catch (error) {
    console.error('PATCH /api/admin/appeals:', error);
    return NextResponse.json({ error: 'Não foi possível salvar a decisão.' }, { status: 500, headers: noStore });
  }
}
