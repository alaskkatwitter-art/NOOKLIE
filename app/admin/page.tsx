import { redirect } from 'next/navigation';
import AdminConsole from './AdminConsole';
import {
  getStaffContext,
  hasStaffPermission,
} from '@/lib/admin/authorization';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const staff = await getStaffContext();
  if (!staff) redirect('/login');
  if (!(await hasStaffPermission(staff, 'admin.view'))) redirect('/');

  const manageableDepartmentIds = staff.isPlatformAdmin
    ? []
    : (await Promise.all(staff.memberships.map(async (membership) => ({
        departmentId: membership.department_id,
        allowed: await hasStaffPermission(staff, 'members.manage', membership.department_id),
      })))).filter((item) => item.allowed).map((item) => item.departmentId);

  return (
    <AdminConsole
      isPlatformAdmin={staff.isPlatformAdmin}
      canManageMembers={staff.isPlatformAdmin || manageableDepartmentIds.length > 0}
      manageableDepartmentIds={manageableDepartmentIds}
    />
  );
}
