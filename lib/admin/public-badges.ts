import type { SupabaseClient } from '@supabase/supabase-js';

export type PublicStaffBadge = {
  title: string;
  description: string;
};

/**
 * Public profile labels are derived from active database membership only.
 * Root administration is identified by platform_admins, never by username
 * or a profile verification flag.
 */
export async function getPublicStaffBadges(
  supabase: SupabaseClient,
  userId: string
): Promise<PublicStaffBadge[]> {
  const { data: rootAdmin, error: rootError } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (rootError) throw rootError;

  const { data: memberships, error: membershipsError } = await supabase
    .from('team_memberships')
    .select('role_id, department_id')
    .eq('user_id', userId)
    .eq('status', 'active');
  if (membershipsError) throw membershipsError;

  const roleIds = Array.from(new Set((memberships || []).map((item) => item.role_id)));
  const departmentIds = Array.from(new Set((memberships || []).map((item) => item.department_id)));
  let roles: Array<{ id: string; department_id: string; name: string; badge_title: string | null; badge_description: string | null }> = [];
  let departments: Array<{ id: string; name: string }> = [];

  if (roleIds.length) {
    const { data, error } = await supabase
      .from('team_roles')
      .select('id, department_id, name, badge_title, badge_description')
      .in('id', roleIds)
      .eq('status', 'active');
    if (error) throw error;
    roles = data || [];
  }

  if (departmentIds.length) {
    const { data, error } = await supabase
      .from('departments')
      .select('id, name')
      .in('id', departmentIds)
      .eq('status', 'active');
    if (error) throw error;
    departments = data || [];
  }

  const departmentById = new Map(departments.map((item) => [item.id, item.name]));
  const badges = (memberships || []).flatMap((membership) => {
    const role = roles.find((item) =>
      item.id === membership.role_id && item.department_id === membership.department_id
    );
    const departmentName = departmentById.get(membership.department_id);
    if (!role || !departmentName) return [];
    return [{
      title: role.badge_title || role.name,
      description: role.badge_description || departmentName,
    }];
  });

  if (rootAdmin) {
    badges.unshift({
      title: 'Administração do Nooklie',
      description: 'Equipe oficial do Nooklie',
    });
  }

  return badges;
}
