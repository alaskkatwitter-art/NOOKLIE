import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getStaffContext,
  getStaffDepartmentIds,
  hasStaffPermission,
  staffPermissionErrorResponse,
} from '@/lib/admin/authorization';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

const noStore = { 'Cache-Control': 'no-store' };

async function canAny(staff: NonNullable<Awaited<ReturnType<typeof getStaffContext>>>, permissions: string[]) {
  for (const permission of permissions) {
    if (await hasStaffPermission(staff, permission)) return true;
  }
  return false;
}

function dbError(error: { code?: string; message?: string }, label: string) {
  const code = error.code || '';
  if (code === '42501') return NextResponse.json({ error: 'Você não tem permissão para esta ação.' }, { status: 403, headers: noStore });
  if (code === 'P0002') return NextResponse.json({ error: 'O registro solicitado não existe ou não está ativo.' }, { status: 404, headers: noStore });
  if (code === '23505') return NextResponse.json({ error: 'Já existe um registro com esses dados.' }, { status: 409, headers: noStore });
  if (code.startsWith('22')) return NextResponse.json({ error: 'Confira os dados informados.' }, { status: 400, headers: noStore });
  console.error(label, error);
  return NextResponse.json({ error: 'Não foi possível concluir a operação.' }, { status: 500, headers: noStore });
}

function cleanText(value: unknown, maxLength: number, required = false): string | null {
  if (typeof value !== 'string') return required ? null : '';
  const cleaned = value.trim();
  if (cleaned.length > maxLength || (required && !cleaned)) return null;
  return cleaned;
}

async function getStaffOrResponse() {
  const staff = await getStaffContext();
  if (!staff) return { staff: null, response: staffPermissionErrorResponse(401) };
  return { staff, response: null };
}

export async function GET(request: NextRequest) {
  try {
    const { staff, response } = await getStaffOrResponse();
    if (!staff) return response || staffPermissionErrorResponse(401);
    const resource = request.nextUrl.searchParams.get('resource');

    if (resource === 'departments') {
      if (!(await canAny(staff, ['departments.manage', 'members.view', 'opportunities.view', 'opportunities.manage', 'applications.view', 'applications.review']))) return staffPermissionErrorResponse(403);
      let query = supabase.from('departments')
        .select('id, name, slug, description, sort_order, status, created_at, updated_at, archived_at')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (!staff.isPlatformAdmin) {
        const ids = await getStaffDepartmentIds(staff, ['members.view', 'departments.manage', 'opportunities.view', 'opportunities.manage', 'applications.view', 'applications.review']);
        if (!ids.length) return NextResponse.json({ departments: [] }, { headers: noStore });
        query = query.in('id', ids);
      }
      const { data, error } = await query;
      if (error) return dbError(error, 'GET admin departments');
      return NextResponse.json({ departments: data || [] }, { headers: noStore });
    }

    if (resource === 'roles') {
      if (!(await canAny(staff, ['roles.manage', 'members.view', 'members.manage', 'applications.view', 'applications.review', 'opportunities.manage']))) return staffPermissionErrorResponse(403);
      let query = supabase.from('team_roles')
        .select('id, department_id, name, description, badge_title, badge_description, status, created_at, updated_at')
        .order('name', { ascending: true });
      if (!staff.isPlatformAdmin) {
        const ids = await getStaffDepartmentIds(staff, ['members.view', 'members.manage', 'applications.view', 'applications.review', 'opportunities.manage']);
        if (!ids.length) return NextResponse.json({ roles: [], permissions: [] }, { headers: noStore });
        query = query.in('department_id', ids);
      }
      const { data: roles, error } = await query;
      if (error) return dbError(error, 'GET admin roles');
      let permissions: Array<{ code: string; name: string; description: string }> = [];
      if (staff.isPlatformAdmin) {
        const result = await supabase.from('permissions').select('code, name, description').eq('scope', 'department').order('name');
        if (result.error) return dbError(result.error, 'GET admin permissions');
        permissions = result.data || [];
      }
      const roleIds = (roles || []).map((role) => role.id);
      let grants: Array<{ role_id: string; permission_code: string }> = [];
      if (roleIds.length) {
        const result = await supabase.from('team_role_permissions').select('role_id, permission_code').in('role_id', roleIds);
        if (result.error) return dbError(result.error, 'GET admin role permissions');
        grants = result.data || [];
      }
      return NextResponse.json({
        roles: (roles || []).map((role) => ({
          ...role,
          permission_codes: grants.filter((grant) => grant.role_id === role.id).map((grant) => grant.permission_code),
        })),
        permissions,
      }, { headers: noStore });
    }

    if (resource === 'members') {
      if (!(await hasStaffPermission(staff, 'members.view'))) return staffPermissionErrorResponse(403);
      const scopeIds = await getStaffDepartmentIds(staff, ['members.view']);
      if (!staff.isPlatformAdmin && !scopeIds.length) return NextResponse.json({ members: [] }, { headers: noStore });
      const status = request.nextUrl.searchParams.get('status');
      let query = supabase.from('team_memberships')
        .select('id, user_id, department_id, role_id, status, assigned_at, removed_at, removal_reason, assigned_by, removed_by')
        .order('assigned_at', { ascending: false })
        .limit(250);
      if (!staff.isPlatformAdmin) query = query.in('department_id', scopeIds);
      if (status === 'active' || status === 'removed') query = query.eq('status', status);
      const { data: memberships, error } = await query;
      if (error) return dbError(error, 'GET admin members');
      const rows = memberships || [];
      const userIds = Array.from(new Set(rows.map((row) => row.user_id)));
      const roleIds = Array.from(new Set(rows.map((row) => row.role_id)));
      const departmentIds = Array.from(new Set(rows.map((row) => row.department_id)));
      const [profilesResult, rolesResult, departmentsResult] = await Promise.all([
        userIds.length ? supabase.from('profiles').select('user_id, username, display_name, avatar_url').in('user_id', userIds) : Promise.resolve({ data: [], error: null }),
        roleIds.length ? supabase.from('team_roles').select('id, name, badge_title, badge_description').in('id', roleIds) : Promise.resolve({ data: [], error: null }),
        departmentIds.length ? supabase.from('departments').select('id, name').in('id', departmentIds) : Promise.resolve({ data: [], error: null }),
      ]);
      const relatedError = profilesResult.error || rolesResult.error || departmentsResult.error;
      if (relatedError) return dbError(relatedError, 'GET admin member details');
      return NextResponse.json({
        members: rows.map((row) => ({
          ...row,
          profile: (profilesResult.data || []).find((profile) => profile.user_id === row.user_id) || null,
          role: (rolesResult.data || []).find((role) => role.id === row.role_id) || null,
          department: (departmentsResult.data || []).find((department) => department.id === row.department_id) || null,
        })),
      }, { headers: noStore });
    }

    if (resource === 'opportunities') {
      if (!(await canAny(staff, ['opportunities.view', 'opportunities.manage']))) return staffPermissionErrorResponse(403);
      let query = supabase.from('opportunities')
        .select('id, department_id, title, description, requirements, openings, questions, opens_at, closes_at, status, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (!staff.isPlatformAdmin) {
        const ids = await getStaffDepartmentIds(staff, ['opportunities.view', 'opportunities.manage']);
        if (!ids.length) return NextResponse.json({ opportunities: [] }, { headers: noStore });
        query = query.in('department_id', ids);
      }
      const { data: opportunities, error } = await query;
      if (error) return dbError(error, 'GET admin opportunities');
      const ids = Array.from(new Set((opportunities || []).map((item) => item.department_id)));
      const { data: departments, error: departmentError } = ids.length
        ? await supabase.from('departments').select('id, name').in('id', ids)
        : { data: [], error: null };
      if (departmentError) return dbError(departmentError, 'GET admin opportunity departments');
      return NextResponse.json({
        opportunities: (opportunities || []).map((item) => ({
          ...item,
          department: (departments || []).find((department) => department.id === item.department_id) || null,
        })),
      }, { headers: noStore });
    }

    if (resource === 'users') {
      if (!(await hasStaffPermission(staff, 'users.view'))) return staffPermissionErrorResponse(403);
      const raw = request.nextUrl.searchParams.get('q') || '';
      const term = raw.trim().replace(/[^a-zA-Z0-9À-ÿ _.-]/g, '').slice(0, 40);
      if (term.length < 2) return NextResponse.json({ users: [] }, { headers: noStore });
      const pattern = '%' + term + '%';
      const { data, error } = await supabase.from('profiles')
        .select('user_id, username, display_name, avatar_url, created_at')
        .or('username.ilike.' + pattern + ',display_name.ilike.' + pattern)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) return dbError(error, 'GET admin users');
      return NextResponse.json({ users: data || [] }, { headers: noStore });
    }

    if (resource === 'candidates') {
      const manageable = staff.isPlatformAdmin || await canAny(staff, ['members.manage']);
      if (!manageable) return staffPermissionErrorResponse(403);
      const raw = request.nextUrl.searchParams.get('q') || '';
      const term = raw.trim().replace(/[^a-zA-Z0-9À-ÿ _.-]/g, '').slice(0, 40);
      if (term.length < 2) return NextResponse.json({ candidates: [] }, { headers: noStore });
      const pattern = '%' + term + '%';
      const { data, error } = await supabase.from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .or('username.ilike.' + pattern + ',display_name.ilike.' + pattern)
        .order('username', { ascending: true })
        .limit(20);
      if (error) return dbError(error, 'GET admin candidates');
      return NextResponse.json({ candidates: data || [] }, { headers: noStore });
    }

    if (resource === 'audit') {
      if (!(await hasStaffPermission(staff, 'audit.view'))) return staffPermissionErrorResponse(403);
      const { data, error } = await supabase.from('admin_audit_log')
        .select('id, actor_user_id, action, subject_type, subject_id, details, created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) return dbError(error, 'GET admin audit log');
      const actorIds = Array.from(new Set((data || []).map((row) => row.actor_user_id).filter(Boolean)));
      const { data: actors, error: actorsError } = actorIds.length
        ? await supabase.from('profiles').select('user_id, username, display_name').in('user_id', actorIds)
        : { data: [], error: null };
      if (actorsError) return dbError(actorsError, 'GET admin audit actors');
      return NextResponse.json({
        entries: (data || []).map((row) => ({
          ...row,
          actor: (actors || []).find((actor) => actor.user_id === row.actor_user_id) || null,
        })),
      }, { headers: noStore });
    }

    return NextResponse.json({ error: 'Área administrativa desconhecida.' }, { status: 400, headers: noStore });
  } catch (error) {
    console.error('GET /api/admin/manage:', error);
    return NextResponse.json({ error: 'Não foi possível carregar os dados administrativos.' }, { status: 500, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { staff, response } = await getStaffOrResponse();
    if (!staff) return response || staffPermissionErrorResponse(401);
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400, headers: noStore });

    if (body.resource === 'department') {
      if (!(await hasStaffPermission(staff, 'departments.manage'))) return staffPermissionErrorResponse(403);
      const name = cleanText(body.name, 80, true);
      const slug = cleanText(body.slug, 80, true);
      const description = cleanText(body.description, 1000) || '';
      const sortOrder = Number.isInteger(body.sort_order) ? body.sort_order : 0;
      if (!name || !slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return NextResponse.json({ error: 'Nome ou identificador do departamento inválido.' }, { status: 400, headers: noStore });
      const { data, error } = await supabase.rpc('admin_create_department', {
        p_session_token_hash: staff.sessionTokenHash,
        p_name: name,
        p_slug: slug,
        p_description: description,
        p_sort_order: sortOrder,
      });
      if (error) return dbError(error, 'POST admin department');
      return NextResponse.json({ id: data }, { status: 201, headers: noStore });
    }

    if (body.resource === 'opportunity') {
      if (!(await hasStaffPermission(staff, 'opportunities.manage', body.department_id))) return staffPermissionErrorResponse(403);
      const id = cleanText(body.id, 80, true);
      const title = cleanText(body.title, 120, true);
      const description = cleanText(body.description, 12000) || '';
      const requirements = cleanText(body.requirements, 8000) || '';
      const openings = Number.isInteger(body.openings) ? body.openings : 0;
      const status = ['draft', 'open', 'closed', 'archived'].includes(body.status) ? body.status : null;
      const opensAt = new Date(body.opens_at);
      const closesAt = new Date(body.closes_at);
      if (!id || !title || typeof body.department_id !== 'string' || !status || !Array.isArray(body.questions) ||
          !Number.isFinite(opensAt.getTime()) || !Number.isFinite(closesAt.getTime()) || closesAt <= opensAt) {
        return NextResponse.json({ error: 'Confira os campos e as datas da vaga.' }, { status: 400, headers: noStore });
      }
      const { data, error } = await supabase.rpc('admin_update_opportunity', {
        p_session_token_hash: staff.sessionTokenHash,
        p_opportunity_id: id,
        p_department_id: body.department_id,
        p_title: title,
        p_description: description,
        p_requirements: requirements,
        p_openings: openings,
        p_questions: body.questions,
        p_opens_at: opensAt.toISOString(),
        p_closes_at: closesAt.toISOString(),
        p_status: status,
      });
      if (error) return dbError(error, 'PATCH admin opportunity');
      return NextResponse.json({ updated: Boolean(data) }, { headers: noStore });
    }

    if (body.resource === 'role') {
      if (!(await hasStaffPermission(staff, 'roles.manage'))) return staffPermissionErrorResponse(403);
      const name = cleanText(body.name, 80, true);
      const description = cleanText(body.description, 1000) || '';
      const badgeTitle = cleanText(body.badge_title, 80) || '';
      const badgeDescription = cleanText(body.badge_description, 120) || '';
      const permissionCodes = Array.isArray(body.permission_codes) && body.permission_codes.every((value: unknown) => typeof value === 'string')
        ? Array.from(new Set(body.permission_codes as string[]))
        : null;
      if (!name || !permissionCodes || typeof body.department_id !== 'string') return NextResponse.json({ error: 'Dados do cargo inválidos.' }, { status: 400, headers: noStore });
      const { data, error } = await supabase.rpc('admin_create_team_role', {
        p_session_token_hash: staff.sessionTokenHash,
        p_department_id: body.department_id,
        p_name: name,
        p_description: description,
        p_badge_title: badgeTitle,
        p_badge_description: badgeDescription,
        p_permission_codes: permissionCodes,
      });
      if (error) return dbError(error, 'POST admin role');
      return NextResponse.json({ id: data }, { status: 201, headers: noStore });
    }

    if (body.resource === 'opportunity') {
      if (!(await hasStaffPermission(staff, 'opportunities.manage', body.department_id))) return staffPermissionErrorResponse(403);
      const title = cleanText(body.title, 120, true);
      const description = cleanText(body.description, 12000) || '';
      const requirements = cleanText(body.requirements, 8000) || '';
      const openings = Number.isInteger(body.openings) ? body.openings : 0;
      const status = ['draft', 'open', 'closed', 'archived'].includes(body.status) ? body.status : 'draft';
      const opensAt = new Date(body.opens_at);
      const closesAt = new Date(body.closes_at);
      if (!title || typeof body.department_id !== 'string' || !Array.isArray(body.questions) ||
          !Number.isFinite(opensAt.getTime()) || !Number.isFinite(closesAt.getTime()) || closesAt <= opensAt) {
        return NextResponse.json({ error: 'Confira os campos e as datas da vaga.' }, { status: 400, headers: noStore });
      }
      const { data, error } = await supabase.rpc('admin_create_opportunity', {
        p_session_token_hash: staff.sessionTokenHash,
        p_department_id: body.department_id,
        p_title: title,
        p_description: description,
        p_requirements: requirements,
        p_openings: openings,
        p_questions: body.questions,
        p_opens_at: opensAt.toISOString(),
        p_closes_at: closesAt.toISOString(),
        p_status: status,
      });
      if (error) return dbError(error, 'POST admin opportunity');
      return NextResponse.json({ id: data }, { status: 201, headers: noStore });
    }

    if (body.resource === 'member') {
      if (!(staff.isPlatformAdmin || await canAny(staff, ['members.manage']))) return staffPermissionErrorResponse(403);
      if (typeof body.user_id !== 'string' || typeof body.role_id !== 'string') return NextResponse.json({ error: 'Escolha uma pessoa e um cargo.' }, { status: 400, headers: noStore });
      const { data, error } = await supabase.rpc('admin_assign_team_member', {
        p_session_token_hash: staff.sessionTokenHash,
        p_target_user_id: body.user_id,
        p_role_id: body.role_id,
      });
      if (error) return dbError(error, 'POST admin member appointment');
      return NextResponse.json({ id: data }, { status: 201, headers: noStore });
    }

    return NextResponse.json({ error: 'Operação administrativa desconhecida.' }, { status: 400, headers: noStore });
  } catch (error) {
    console.error('POST /api/admin/manage:', error);
    return NextResponse.json({ error: 'Não foi possível concluir a ação administrativa.' }, { status: 500, headers: noStore });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { staff, response } = await getStaffOrResponse();
    if (!staff) return response || staffPermissionErrorResponse(401);
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400, headers: noStore });

    if (body.resource === 'department') {
      if (!(await hasStaffPermission(staff, 'departments.manage'))) return staffPermissionErrorResponse(403);
      const name = cleanText(body.name, 80, true);
      const slug = cleanText(body.slug, 80, true);
      const description = cleanText(body.description, 1000) || '';
      const status = body.status === 'archived' ? 'archived' : body.status === 'active' ? 'active' : null;
      const sortOrder = Number.isInteger(body.sort_order) ? body.sort_order : 0;
      if (!name || !slug || !status || typeof body.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return NextResponse.json({ error: 'Dados do departamento inválidos.' }, { status: 400, headers: noStore });
      const { data, error } = await supabase.rpc('admin_update_department', {
        p_session_token_hash: staff.sessionTokenHash,
        p_department_id: body.id,
        p_name: name,
        p_slug: slug,
        p_description: description,
        p_sort_order: sortOrder,
        p_status: status,
      });
      if (error) return dbError(error, 'PATCH admin department');
      return NextResponse.json({ updated: Boolean(data) }, { headers: noStore });
    }

    if (body.resource === 'role') {
      if (!(await hasStaffPermission(staff, 'roles.manage'))) return staffPermissionErrorResponse(403);
      const name = cleanText(body.name, 80, true);
      const description = cleanText(body.description, 1000) || '';
      const badgeTitle = cleanText(body.badge_title, 80) || '';
      const badgeDescription = cleanText(body.badge_description, 120) || '';
      const status = body.status === 'archived' ? 'archived' : body.status === 'active' ? 'active' : null;
      const permissionCodes = Array.isArray(body.permission_codes) && body.permission_codes.every((value: unknown) => typeof value === 'string')
        ? Array.from(new Set(body.permission_codes as string[]))
        : null;
      if (!name || !status || !permissionCodes || typeof body.id !== 'string') return NextResponse.json({ error: 'Dados do cargo inválidos.' }, { status: 400, headers: noStore });
      const { data, error } = await supabase.rpc('admin_update_team_role', {
        p_session_token_hash: staff.sessionTokenHash,
        p_role_id: body.id,
        p_name: name,
        p_description: description,
        p_badge_title: badgeTitle,
        p_badge_description: badgeDescription,
        p_status: status,
        p_permission_codes: permissionCodes,
      });
      if (error) return dbError(error, 'PATCH admin role');
      return NextResponse.json({ updated: Boolean(data) }, { headers: noStore });
    }

    return NextResponse.json({ error: 'Operação administrativa desconhecida.' }, { status: 400, headers: noStore });
  } catch (error) {
    console.error('PATCH /api/admin/manage:', error);
    return NextResponse.json({ error: 'Não foi possível concluir a ação administrativa.' }, { status: 500, headers: noStore });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { staff, response } = await getStaffOrResponse();
    if (!staff) return response || staffPermissionErrorResponse(401);
    const body = await request.json();
    if (!body || body.resource !== 'member' || typeof body.id !== 'string') return NextResponse.json({ error: 'Vínculo inválido.' }, { status: 400, headers: noStore });
    if (body.confirm !== true) return NextResponse.json({ error: 'Confirme a remoção do integrante.' }, { status: 400, headers: noStore });
    if (!(staff.isPlatformAdmin || await canAny(staff, ['members.manage']))) return staffPermissionErrorResponse(403);
    const reason = cleanText(body.reason, 500) || '';
    const { data, error } = await supabase.rpc('admin_remove_team_member', {
      p_session_token_hash: staff.sessionTokenHash,
      p_membership_id: body.id,
      p_reason: reason,
    });
    if (error) return dbError(error, 'DELETE admin member');
    return NextResponse.json({ removed: Boolean(data) }, { headers: noStore });
  } catch (error) {
    console.error('DELETE /api/admin/manage:', error);
    return NextResponse.json({ error: 'Não foi possível remover o integrante.' }, { status: 500, headers: noStore });
  }
}
