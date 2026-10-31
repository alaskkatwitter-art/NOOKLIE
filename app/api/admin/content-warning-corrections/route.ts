import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStaffContext, getStaffDepartmentIds, hasStaffPermission, staffPermissionErrorResponse } from '@/lib/admin/authorization';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);
const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    const staff = await getStaffContext();
    if (!staff) return staffPermissionErrorResponse(401);
    if (!staff.isPlatformAdmin && !(await hasStaffPermission(staff, 'moderation.view')) &&
        !(await hasStaffPermission(staff, 'moderation.manage'))) return staffPermissionErrorResponse(403);
    const departmentIds = staff.isPlatformAdmin ? [] : await getStaffDepartmentIds(staff, ['moderation.view', 'moderation.manage']);
    if (!staff.isPlatformAdmin && departmentIds.length === 0) return NextResponse.json({ requests: [] }, { headers: noStore });
    let query = supabase.from('content_warning_corrections')
      .select('id, story_id, author_user_id, department_id, source_report_id, missing_warnings, notice, due_at, author_response, internal_notes, status, created_at, submitted_at, decided_at, decision')
      .order('created_at', { ascending: false }).limit(300);
    if (!staff.isPlatformAdmin) query = query.in('department_id', departmentIds);
    const { data, error } = await query;
    if (error) throw error;
    const storyIds = Array.from(new Set((data || []).map((item) => item.story_id)));
    const userIds = Array.from(new Set((data || []).map((item) => item.author_user_id).filter((id): id is string => Boolean(id))));
    const [stories, profiles] = await Promise.all([
      storyIds.length ? supabase.from('stories').select('id, title').in('id', storyIds) : Promise.resolve({ data: [], error: null }),
      userIds.length ? supabase.from('profiles').select('user_id, username, display_name').in('user_id', userIds) : Promise.resolve({ data: [], error: null }),
    ]);
    if (stories.error) throw stories.error;
    if (profiles.error) throw profiles.error;
    return NextResponse.json({ requests: (data || []).map((item) => ({
      ...item,
      overdue: item.status === 'requested' && new Date(item.due_at).getTime() < Date.now(),
      story: stories.data?.find((story) => story.id === item.story_id) || null,
      author: profiles.data?.find((profile) => profile.user_id === item.author_user_id) || null,
    })) }, { headers: noStore });
  } catch (error) {
    console.error('GET /api/admin/content-warning-corrections:', error);
    return NextResponse.json({ error: 'Não foi possível carregar os pedidos de correção.' }, { status: 500, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  try {
    const staff = await getStaffContext();
    if (!staff) return staffPermissionErrorResponse(401);
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.story_id !== 'string' ||
        !Array.isArray(body.missing_warnings) || !body.missing_warnings.every((item: unknown) => typeof item === 'string') ||
        typeof body.notice !== 'string' || typeof body.due_at !== 'string' ||
        (body.source_report_id !== null && body.source_report_id !== undefined && typeof body.source_report_id !== 'string')) {
      return NextResponse.json({ error: 'Informe a história, os avisos ausentes, a orientação e o prazo.' }, { status: 400, headers: noStore });
    }
    const warnings = Array.from(new Set((body.missing_warnings as string[]).map((item) => item.trim()).filter(Boolean)));
    const dueAt = new Date(body.due_at);
    if (warnings.length < 1 || warnings.length > 12 || !body.notice.trim() || body.notice.trim().length > 2000 || !Number.isFinite(dueAt.getTime())) {
      return NextResponse.json({ error: 'Revise os avisos, a orientação e a data limite.' }, { status: 400, headers: noStore });
    }
    const { data, error } = await supabase.rpc('admin_create_content_warning_correction', {
      p_session_token_hash: staff.sessionTokenHash,
      p_story_id: body.story_id,
      p_source_report_id: body.source_report_id || null,
      p_missing_warnings: warnings,
      p_notice: body.notice.trim(),
      p_due_at: dueAt.toISOString(),
    });
    if (error) {
      if (error.code === '42501') return staffPermissionErrorResponse(403);
      if (error.code === '23505') return NextResponse.json({ error: 'Já existe um pedido aberto para esta história.' }, { status: 409, headers: noStore });
      if (error.code === '22023') return NextResponse.json({ error: 'O prazo deve ficar entre uma hora e 30 dias a partir de agora.' }, { status: 400, headers: noStore });
      throw error;
    }
    return NextResponse.json({ id: data }, { status: 201, headers: noStore });
  } catch (error) {
    console.error('POST /api/admin/content-warning-corrections:', error);
    return NextResponse.json({ error: 'Não foi possível criar o pedido de correção.' }, { status: 500, headers: noStore });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const staff = await getStaffContext();
    if (!staff) return staffPermissionErrorResponse(401);
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.id !== 'string' ||
        !['corrected', 'not_corrected', 'cancelled'].includes(body.decision) || body.confirm !== true ||
        (body.internal_notes !== undefined && typeof body.internal_notes !== 'string')) {
      return NextResponse.json({ error: 'Confirme a decisão e informe um resultado válido.' }, { status: 400, headers: noStore });
    }
    const notes = (body.internal_notes || '').trim();
    if (notes.length > 4000) return NextResponse.json({ error: 'As observações internas podem ter até 4.000 caracteres.' }, { status: 400, headers: noStore });
    const { data: correction, error: lookupError } = await supabase.from('content_warning_corrections')
      .select('department_id').eq('id', body.id).maybeSingle();
    if (lookupError) throw lookupError;
    if (!correction) return NextResponse.json({ error: 'Pedido de correção não encontrado.' }, { status: 404, headers: noStore });
    if (!(await hasStaffPermission(staff, 'moderation.manage', correction.department_id))) return staffPermissionErrorResponse(403);
    const { data, error } = await supabase.rpc('admin_decide_content_warning_correction', {
      p_session_token_hash: staff.sessionTokenHash, p_correction_id: body.id,
      p_decision: body.decision, p_internal_notes: notes,
    });
    if (error) {
      if (error.code === '42501') return staffPermissionErrorResponse(403);
      if (error.code === 'P0002') return NextResponse.json({ error: 'Este pedido já foi decidido.' }, { status: 409, headers: noStore });
      throw error;
    }
    return NextResponse.json({ updated: Boolean(data) }, { headers: noStore });
  } catch (error) {
    console.error('PATCH /api/admin/content-warning-corrections:', error);
    return NextResponse.json({ error: 'Não foi possível salvar a decisão.' }, { status: 500, headers: noStore });
  }
}
