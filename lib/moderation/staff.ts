import { getD1PreviewDatabase } from '@/lib/database/preview';
import { getStaffContext, hasStaffPermission } from "@/lib/admin/authorization";
import { discoveryDb } from "@/lib/discovery/server";
export async function moderationStaff(permission = "moderation.view") {
  const staff = await getStaffContext();
  if (!staff) return null;
  const db = getD1PreviewDatabase('auth');
  const dept = db ? { data: await db.prepare("SELECT id FROM departments WHERE slug='moderacao' AND status='active'").first<{id:string}>(), error: null } : await discoveryDb
    .from("departments")
    .select("id")
    .eq("slug", "moderacao")
    .eq("status", "active")
    .maybeSingle();
  if (dept.error) throw dept.error;
  if (!dept.data) return null;
  if (
    !staff.isPlatformAdmin &&
    !(await hasStaffPermission(staff, permission, dept.data.id)) &&
    !(
      permission === "moderation.view" &&
      (await hasStaffPermission(staff, "moderation.manage", dept.data.id))
    )
  )
    return null;
  return { ...staff, departmentId: dept.data.id };
}
