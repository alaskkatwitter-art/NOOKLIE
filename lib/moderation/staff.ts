import { getStaffContext, hasStaffPermission } from "@/lib/admin/authorization";
import { discoveryDb } from "@/lib/discovery/server";
export async function moderationStaff(permission = "moderation.view") {
  const staff = await getStaffContext();
  if (!staff) return null;
  const dept = await discoveryDb
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
