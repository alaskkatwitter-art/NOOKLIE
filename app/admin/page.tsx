import { redirect } from 'next/navigation';
import Link from 'next/link';
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
    appeals: await hasStaffPermission(staff, 'moderation.appeals.manage', membership.department_id),
  })));
  const manageableDepartmentIds = capabilities.filter((item) => item.members).map((item) => item.departmentId);
  const manageableOpportunityDepartmentIds = capabilities.filter((item) => item.opportunities).map((item) => item.departmentId);
  const canManagePolicies = await hasStaffPermission(staff, 'policies.manage');

  return (
    <>
    {canManagePolicies && <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6"><Link href="/admin/politicas" className="inline-flex rounded-xl border border-[#ff78b9]/30 bg-[#ff78b9]/10 px-4 py-2 text-sm font-semibold text-[#ff9aca] hover:bg-[#ff78b9]/15">Gerenciar políticas institucionais</Link></div>}
    <AdminConsole
      isPlatformAdmin={staff.isPlatformAdmin}
      canManageMembers={staff.isPlatformAdmin || manageableDepartmentIds.length > 0}
      manageableDepartmentIds={manageableDepartmentIds}
      canManageOpportunities={staff.isPlatformAdmin || manageableOpportunityDepartmentIds.length > 0}
      manageableOpportunityDepartmentIds={manageableOpportunityDepartmentIds}
      canViewUsers={staff.isPlatformAdmin || await hasStaffPermission(staff, 'users.view')}
      canManageUsers={staff.isPlatformAdmin || await hasStaffPermission(staff, 'users.manage')}
      canViewModeration={staff.isPlatformAdmin || await hasStaffPermission(staff, 'moderation.view') || await hasStaffPermission(staff, 'moderation.manage')}
      canViewAppeals={staff.isPlatformAdmin || capabilities.some((item) => item.appeals)}
      canManageModeration={staff.isPlatformAdmin || await hasStaffPermission(staff, 'moderation.manage')}
      canManageAppeals={staff.isPlatformAdmin || capabilities.some((item) => item.appeals)}
      canViewOpportunities={staff.isPlatformAdmin || await hasStaffPermission(staff, 'opportunities.view')}
      canViewApplications={staff.isPlatformAdmin || await hasStaffPermission(staff, 'applications.view')}
      canReviewApplications={staff.isPlatformAdmin || capabilities.some((item) => item.applications)}
      reviewableDepartmentIds={capabilities.filter((item) => item.applications).map((item) => item.departmentId)}
    />
    </>
  );
}
