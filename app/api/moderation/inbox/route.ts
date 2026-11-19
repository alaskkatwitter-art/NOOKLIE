import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1Moderation } from '@/lib/database/d1-moderation';
import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { d1Permissions } from '@/lib/database/d1-permissions';
import type { NooklieD1 } from '@/lib/database/d1';

async function d1InboxStaff(db: NooklieD1, manage = false) {
  const staff = await getAuthenticatedUserContext();
  if (!staff) return null;
  const department = await db.prepare("SELECT id FROM departments WHERE slug='moderacao' AND status='active'")
    .first<{ id: string }>();
  if (!department) return null;
  const permissions = d1Permissions(db);
  const allowed = await permissions.hasPermission(staff.sessionTokenHash, 'moderation.manage', department.id)
    || (!manage && await permissions.hasPermission(staff.sessionTokenHash, 'moderation.view', department.id));
  return allowed ? staff : null;
}
import { NextResponse } from "next/server";
import { moderationStaff } from "@/lib/moderation/staff";
import { chatDb, privateHeaders, sameOrigin, uuid } from "@/lib/chat/server";
export async function GET() {
  try {
    const db = getD1PreviewDatabase('auth');
    if (db) {
      const staff = await d1InboxStaff(db);
      if (!staff) return new NextResponse(null, { status: 403 });
      const tickets = await d1Moderation(db).tickets(staff.sessionTokenHash);
      return NextResponse.json({ tickets }, { headers: privateHeaders });
    }
    const staff = await moderationStaff();
    if (!staff) return new NextResponse(null, { status: 403 });
    let q = chatDb
      .from("support_tickets")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (!staff.isPlatformAdmin) q = q.eq("department_id", staff.departmentId);
    const r = await q;
    if (r.error) throw r.error;
    const ids = [
      ...new Set(
        (r.data || [])
          .flatMap((t) => [t.reporter_id, t.target_user_id])
          .filter(Boolean),
      ),
    ];
    const p = ids.length
      ? await chatDb
          .from("profiles")
          .select("user_id,username")
          .in("user_id", ids)
      : { data: [], error: null };
    if (p.error) throw p.error;
    return NextResponse.json(
      {
        tickets: (r.data || []).map((t) => ({
          ...t,
          reporter: p.data?.find((v) => v.user_id === t.reporter_id)?.username,
          target: p.data?.find((v) => v.user_id === t.target_user_id)?.username,
        })),
      },
      { headers: privateHeaders },
    );
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
export async function PATCH(request: Request) {
  try {
    if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
    const db = getD1PreviewDatabase('auth');
    const staff = db ? await d1InboxStaff(db, true) : await moderationStaff("moderation.manage");
    if (!staff) return new NextResponse(null, { status: 403 });
    const raw = await request.text();
    if (raw.length > 14000) return new NextResponse(null, { status: 400 });
    const b = JSON.parse(raw);
    if (
      !uuid.test(b.id || "") ||
      !["in_review", "resolved", "dismissed"].includes(b.status) ||
      typeof b.notes !== "string" ||
      b.notes.length > 8000 ||
      typeof b.response !== "string" ||
      b.response.length > 3000
    )
      return new NextResponse(null, { status: 400 });
    if (db) {
      try {
        await d1Moderation(db).reviewTicket(staff.sessionTokenHash, crypto.randomUUID(), b.id.toLowerCase(),
          b.status, b.notes, b.response);
      } catch {
        return new NextResponse(null, { status: 403 });
      }
      return NextResponse.json({ updated: true }, { headers: privateHeaders });
    }
    const r = await chatDb.rpc("support_review", {
      p_session: staff.sessionTokenHash,
      p_id: b.id,
      p_status: b.status,
      p_notes: b.notes,
      p_response: b.response,
    });
    if (r.error || !r.data) return new NextResponse(null, { status: 403 });
    return NextResponse.json({ updated: true }, { headers: privateHeaders });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
