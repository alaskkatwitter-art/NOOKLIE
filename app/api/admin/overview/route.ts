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
