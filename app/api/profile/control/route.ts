import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1FollowActor } from '@/lib/database/d1-follow-http';
import { d1Social } from '@/lib/database/d1-social';
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
    const db = getD1PreviewDatabase('auth');
    const viewer = db ? await d1FollowActor(db) : null;
    const actor = db ? null : await chatActor();
    if (!actor && !viewer) return new NextResponse(null, { status: 401 });
    const target = new URL(request.url).searchParams.get("target") || "";
    if (!uuid.test(target)) return new NextResponse(null, { status: 400 });
    if (db && viewer) {
      const result = await db.prepare(`SELECT
        EXISTS(SELECT 1 FROM chat_blocks WHERE blocker_id=a.profile_id AND blocked_id=?2) AS blocked,
        EXISTS(SELECT 1 FROM profile_mutes WHERE user_id=a.profile_id AND target_id=?2) AS muted
        FROM d1_social_actors a WHERE a.token_hash=?1`).bind(viewer.hash,target)
        .first<{blocked:number;muted:number}>();
      if (!result) return new NextResponse(null,{status:401});
      return NextResponse.json({blocked:Boolean(result.blocked),muted:Boolean(result.muted)},{headers:privateHeaders});
    }
    if (!actor) return new NextResponse(null,{status:401});
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
    const db = getD1PreviewDatabase('auth');
    const viewer = db ? await d1FollowActor(db) : null;
    const actor = db ? null : await chatActor();
    if (!actor && !viewer) return new NextResponse(null, { status: 401 });
    const raw = await request.text();
    if (raw.length > 200) return new NextResponse(null, { status: 400 });
    const body = JSON.parse(raw);
    if (
      !uuid.test(body.target || "") ||
      !["block", "unblock", "mute", "unmute"].includes(body.action)
    )
      return new NextResponse(null, { status: 400 });
    if (db && viewer) {
      const target = body.target;
      if (target===viewer.id || !await db.prepare('SELECT id FROM profiles WHERE id=?').bind(target).first()) {
        return new NextResponse(null,{status:409});
      }
      const social = d1Social(db);
      const actions = {block:social.block,unblock:social.unblock,mute:social.mute,unmute:social.unmute};
      await actions[body.action as keyof typeof actions](viewer.hash,target);
      return NextResponse.json({updated:true},{headers:privateHeaders});
    }
    if (!actor) return new NextResponse(null,{status:401});
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
