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

  const capabilities = await Promise.all(staff.memberships.map(async (membership) => ({
    departmentId: membership.department_id,
    members: await hasStaffPermission(staff, 'members.manage', membership.department_id),
    opportunities: await hasStaffPermission(staff, 'opportunities.manage', membership.department_id),
    applications: await hasStaffPermission(staff, 'applications.review', membership.department_id),
  })));
  const manageableDepartmentIds = capabilities.filter((item) => item.members).map((item) => item.departmentId);
  const manageableOpportunityDepartmentIds = capabilities.filter((item) => item.opportunities).map((item) => item.departmentId);

  return (
    <AdminConsole
      isPlatformAdmin={staff.isPlatformAdmin}
      canManageMembers={staff.isPlatformAdmin || manageableDepartmentIds.length > 0}
      manageableDepartmentIds={manageableDepartmentIds}
      canManageOpportunities={staff.isPlatformAdmin || manageableOpportunityDepartmentIds.length > 0}
      manageableOpportunityDepartmentIds={manageableOpportunityDepartmentIds}
      canViewUsers={staff.isPlatformAdmin || await hasStaffPermission(staff, 'users.view')}
      canViewOpportunities={staff.isPlatformAdmin || await hasStaffPermission(staff, 'opportunities.view')}
      canViewApplications={staff.isPlatformAdmin || await hasStaffPermission(staff, 'applications.view')}
      canReviewApplications={staff.isPlatformAdmin || capabilities.some((item) => item.applications)}
      reviewableDepartmentIds={capabilities.filter((item) => item.applications).map((item) => item.departmentId)}
    />
  );
}
