import { NextResponse } from "next/server";
import {
  chatActor,
  chatDb,
  uuid,
  privateHeaders,
  sameOrigin,
} from "@/lib/chat/server";
import {
  isPublicPostVisible,
  isPublicProfileVisible,
} from "@/lib/moderation/content-visibility";
import { visiblePosts, visibleReposts } from "@/lib/social/posts";
import { rateLimitKey } from "@/lib/security/rate-key";
export async function GET(request: Request) {
  try {
    const actor = await chatActor();
    const params = new URL(request.url).searchParams;
    const post = params.get("post_id") || undefined,
      profile = params.get("profile_id") || undefined;
    if (
      (post && !uuid.test(post)) ||
      (profile && !uuid.test(profile)) ||
      (!post && !profile)
    )
      return new NextResponse(null, { status: 400 });
    if (
      (post && !(await isPublicPostVisible(chatDb, post))) ||
      (profile &&
        !(await isPublicProfileVisible(
          chatDb,
          profile,
          actor?.profileId || null,
        )))
    )
      return new NextResponse(null, { status: 404 });
    const entries = await visibleReposts(post, profile, actor?.profileId);
    if (profile) {
      const originals = await visiblePosts(
        entries.map((r) => r.post_id),
        actor?.profileId || null,
      );
      const posts = entries.flatMap((r) => {
        const original = originals.find((p) => p.id === r.post_id);
        return original ? [{ ...original, repost: r }] : [];
      });
      return NextResponse.json(
        { posts },
        { headers: privateHeaders },
      );
    }
    return NextResponse.json(
      {
        reposts: entries.map((r) => ({
          id: r.id,
          author: r.author,
          comment: r.comment,
        })),
        nookled: entries.some((r) => r.user_id === actor?.profileId),
      },
      { headers: privateHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar os republicados." },
      { status: 503, headers: privateHeaders },
    );
  }
}
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
    const actor = await chatActor();
    if (!actor) return new NextResponse(null, { status: 401 });
    const raw = await request.text();
    if (raw.length > 12000) return new NextResponse(null, { status: 413 });
    const body = JSON.parse(raw);
    const id = body.post_id;
    const comment =
      typeof body.comment === "string" ? body.comment.trim() : null;
    if (
      !uuid.test(id || "") ||
      (comment !== null && (!comment || comment.length > 5000))
    )
      return NextResponse.json(
        { error: "Escreva até 5000 caracteres." },
        { status: 400 },
      );
    if (!(await isPublicPostVisible(chatDb, id)))
      return new NextResponse(null, { status: 404 });
    const rate = await chatDb.rpc("consume_auth_rate_limit", {
      p_key_hash: rateLimitKey("repost", actor.profileId),
      p_limit: 60,
      p_window_seconds: 3600,
    });
    if (rate.error || !rate.data)
      return new NextResponse(null, { status: 429 });
    const { error } = await chatDb
      .from("nook_reposts")
      .upsert(
        { user_id: actor.profileId, post_id: id, comment },
        { onConflict: "user_id,post_id", ignoreDuplicates: true },
      );
    if (error) throw error;
    return NextResponse.json({ saved: true }, { headers: privateHeaders });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível nooklar." },
      { status: 503, headers: privateHeaders },
    );
  }
}
export async function DELETE(request: Request) {
  try {
    if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
    const actor = await chatActor();
    if (!actor) return new NextResponse(null, { status: 401 });
    const body = await request.json();
    if (!uuid.test(body.post_id || ""))
      return new NextResponse(null, { status: 400 });
    const { error } = await chatDb
      .from("nook_reposts")
      .delete()
      .eq("user_id", actor.profileId)
      .eq("post_id", body.post_id);
    if (error) throw error;
    return NextResponse.json({ removed: true }, { headers: privateHeaders });
  } catch {
    return new NextResponse(null, { status: 503, headers: privateHeaders });
  }
}
