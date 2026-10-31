import { redirect } from 'next/navigation';
import PoliciesAdmin from './PoliciesAdmin';
import { getStaffContext, hasStaffPermission } from '@/lib/admin/authorization';

export const dynamic = 'force-dynamic';

export default async function AdminPoliciesPage() {
  const staff = await getStaffContext();
  if (!staff) redirect('/login');
  if (!(await hasStaffPermission(staff, 'policies.manage'))) redirect('/admin');
  return <PoliciesAdmin />;
}
