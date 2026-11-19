import { getD1PreviewDatabase } from '@/lib/database/preview';
import { getSessionTokenHash } from '@/lib/auth/session';
import { NextResponse } from 'next/server';
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

export async function GET() {
  try {
    const db = getD1PreviewDatabase('auth');
    if (db) {
      const hash = await getSessionTokenHash();
      if (!hash) return staffPermissionErrorResponse(401);
      const row = await db.prepare(`WITH actor AS (SELECT is_root FROM d1_mod_actor WHERE token_hash=?1),
        scope AS (SELECT DISTINCT department_id FROM d1_mod_grants WHERE token_hash=?1 AND code='admin.view')
        SELECT is_root, is_root OR EXISTS(SELECT 1 FROM scope) AS allowed,
          CASE WHEN is_root THEN (SELECT count(*) FROM profiles) END AS users,
          (SELECT count(*) FROM departments WHERE status='active' AND (is_root OR id IN scope)) AS departments,
          (SELECT count(*) FROM team_roles WHERE status='active' AND (is_root OR department_id IN scope)) AS roles,
          (SELECT count(*) FROM team_memberships WHERE status='active' AND (is_root OR department_id IN scope)) AS members
        FROM actor`).bind(hash).first<{
          is_root: number; allowed: number; users: number | null; departments: number; roles: number; members: number;
        }>();
      if (!row) return staffPermissionErrorResponse(401);
      const { is_root, allowed, ...stats } = row;
      if (!allowed) return staffPermissionErrorResponse(403);
      return NextResponse.json({ is_platform_admin: Boolean(is_root), stats }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const staff = await getStaffContext();

    if (!staff) {
      return staffPermissionErrorResponse(401);
    }

    if (!(await hasStaffPermission(staff, 'admin.view'))) {
      return staffPermissionErrorResponse(403);
    }

    const departmentIds = await getStaffDepartmentIds(staff, ['admin.view']);

    const departmentsQuery = supabase
      .from('departments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    const rolesQuery = supabase
      .from('team_roles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    const membersQuery = supabase
      .from('team_memberships')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active');

    if (!staff.isPlatformAdmin) {
      if (departmentIds.length === 0) {
        return NextResponse.json(
          {
            is_platform_admin: false,
            stats: {
              users: null,
              departments: 0,
              roles: 0,
              members: 0,
            },
          },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      }

      departmentsQuery.in('id', departmentIds);
      rolesQuery.in('department_id', departmentIds);
      membersQuery.in('department_id', departmentIds);
    }

    const [usersResult, departmentsResult, rolesResult, membersResult] =
      await Promise.all([
        staff.isPlatformAdmin
          ? supabase
              .from('profiles')
              .select('id', { count: 'exact', head: true })
          : Promise.resolve({ count: null, error: null }),
        departmentsQuery,
        rolesQuery,
        membersQuery,
      ]);

    const errors = [
      usersResult.error,
      departmentsResult.error,
      rolesResult.error,
      membersResult.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      console.error('Erro ao carregar resumo administrativo:', errors);
      return NextResponse.json(
        { error: 'Não foi possível carregar o painel administrativo.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        is_platform_admin: staff.isPlatformAdmin,
        stats: {
          users: usersResult.count ?? null,
          departments: departmentsResult.count ?? 0,
          roles: rolesResult.count ?? 0,
          members: membersResult.count ?? 0,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('GET /api/admin/overview:', error);
    return NextResponse.json(
      { error: 'Não foi possível carregar o painel administrativo.' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
