import { redirect } from "next/navigation";
import { moderationStaff } from "@/lib/moderation/staff";
import { hasStaffPermission } from "@/lib/admin/authorization";
import ModerationWorkspace from "./workspace";
export const dynamic = "force-dynamic";
export default async function Page() {
  const staff = await moderationStaff();
  if (!staff) redirect("/login");
  return (
    <ModerationWorkspace
      canManage={
        staff.isPlatformAdmin ||
        (await hasStaffPermission(
          staff,
          "moderation.manage",
          staff.departmentId,
        ))
      }
    />
  );
}
