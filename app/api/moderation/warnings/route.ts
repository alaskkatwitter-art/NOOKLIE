import { NextResponse } from "next/server";
import { getStaffContext } from "@/lib/admin/authorization";
import { chatDb, privateHeaders, sameOrigin, uuid } from "@/lib/chat/server";
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
    const staff = await getStaffContext();
    if (!staff) return new NextResponse(null, { status: 401 });
    const raw = await request.text();
    if (raw.length > 3000) return new NextResponse(null, { status: 400 });
    const b = JSON.parse(raw);
    if (
      !["report", "support", "chat"].includes(b.source_type) ||
      !uuid.test(b.source_id || "") ||
      typeof b.reason !== "string" ||
      b.reason.trim().length < 10 ||
      b.reason.length > 2000
    )
      return NextResponse.json(
        { error: "Explique a advertência em 10 a 2.000 caracteres." },
        { status: 400 },
      );
    const r = await chatDb.rpc("moderation_warn", {
      p_session: staff.sessionTokenHash,
      p_source_type: b.source_type,
      p_source_id: b.source_id,
      p_reason: b.reason.trim(),
    });
    if (r.error)
      return NextResponse.json(
        {
          error:
            r.error.code === "23505"
              ? "Já existe uma advertência para este relato."
              : "Não foi possível advertir. Verifique a permissão e se o relato identifica uma conta elegível.",
        },
        { status: 409, headers: privateHeaders },
      );
    return NextResponse.json(
      { warned: true },
      { status: 201, headers: privateHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível aplicar a advertência." },
      { status: 503, headers: privateHeaders },
    );
  }
}
