import { NextResponse } from "next/server";
import {
  chatActor,
  chatDb,
  privateHeaders,
  sameOrigin,
  uuid,
} from "@/lib/chat/server";
export async function GET(request: Request) {
  try {
    const actor = await chatActor();
    if (!actor) return new NextResponse(null, { status: 401 });
    const target = new URL(request.url).searchParams.get("target") || "";
    if (!uuid.test(target)) return new NextResponse(null, { status: 400 });
    const [block, mute] = await Promise.all([
      chatDb
        .from("chat_blocks")
        .select("blocked_id")
        .eq("blocker_id", actor.profileId)
        .eq("blocked_id", target)
        .maybeSingle(),
      chatDb
        .from("profile_mutes")
        .select("target_id")
        .eq("user_id", actor.profileId)
        .eq("target_id", target)
        .maybeSingle(),
    ]);
    if (block.error || mute.error) throw block.error || mute.error;
    return NextResponse.json(
      { blocked: Boolean(block.data), muted: Boolean(mute.data) },
      { headers: privateHeaders },
    );
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
    const actor = await chatActor();
    if (!actor) return new NextResponse(null, { status: 401 });
    const raw = await request.text();
    if (raw.length > 200) return new NextResponse(null, { status: 400 });
    const body = JSON.parse(raw);
    if (
      !uuid.test(body.target || "") ||
      !["block", "unblock", "mute", "unmute"].includes(body.action)
    )
      return new NextResponse(null, { status: 400 });
    const result = await chatDb.rpc("profile_control", {
      p_session: actor.sessionTokenHash,
      p_target: body.target,
      p_action: body.action,
    });
    if (result.error || !result.data)
      return new NextResponse(null, { status: 409 });
    return NextResponse.json({ updated: true }, { headers: privateHeaders });
  } catch {
    return new NextResponse(null, { status: 503 });
  }
}
