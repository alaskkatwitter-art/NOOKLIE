import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export type StaffMembership = {
  role_id: string;
  department_id: string;
};

export type StaffContext = {
  userId: string;
  isPlatformAdmin: boolean;
  memberships: StaffMembership[];
};

export async function getStaffContext(): Promise<StaffContext | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('toriland_session')?.value;

  if (!sessionToken) return null;

  const tokenHash = crypto
    .createHash('sha256')
    .update(sessionToken)
    .digest('hex');

  const { data: session, error: sessionError } = await supabase
    .from('auth_sessions')
    .select('user_id, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (sessionError) throw sessionError;
  if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
    return null;
  }

  const userId = session.user_id as string;
  const { data: platformAdmin, error: adminError } = await supabase
    .from('platform_admins')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (adminError) throw adminError;

  if (platformAdmin) {
    return {
      userId,
      isPlatformAdmin: true,
      memberships: [],
    };
  }

  const { data: memberships, error: membershipError } = await supabase
    .from('team_memberships')
    .select('role_id, department_id')
    .eq('user_id', userId)
    .eq('status', 'active');

  if (membershipError) throw membershipError;

  return {
    userId,
    isPlatformAdmin: false,
    memberships: (memberships || []).map((membership) => ({
      role_id: membership.role_id as string,
      department_id: membership.department_id as string,
    })),
  };
}

export async function hasStaffPermission(
  context: StaffContext,
  permissionCode: string,
  departmentId?: string
): Promise<boolean> {
  if (context.isPlatformAdmin) return true;

  const { data: permission, error: permissionError } = await supabase
    .from('permissions')
    .select('scope')
    .eq('code', permissionCode)
    .maybeSingle();

  if (permissionError) throw permissionError;
  if (!permission || permission.scope !== 'department') return false;

  const eligibleMemberships = context.memberships.filter(
    (membership) =>
      !departmentId || membership.department_id === departmentId
  );
  const roleIds = Array.from(
    new Set(eligibleMemberships.map((membership) => membership.role_id))
  );

  if (roleIds.length === 0) return false;

  const { data: grant, error: grantError } = await supabase
    .from('team_role_permissions')
    .select('role_id')
    .eq('permission_code', permissionCode)
    .in('role_id', roleIds)
    .limit(1)
    .maybeSingle();

  if (grantError) throw grantError;
  return Boolean(grant);
}

export function staffPermissionErrorResponse(
  status: 401 | 403 = 403
) {
  return Response.json(
    {
      error:
        status === 401
          ? 'Você precisa entrar na sua conta.'
          : 'Você não tem permissão para acessar esta área.',
    },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
