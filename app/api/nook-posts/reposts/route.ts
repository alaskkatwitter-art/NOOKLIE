import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1FollowActor, d1FollowState } from '@/lib/database/d1-follow-http';
import { d1Auth } from '@/lib/database/d1-auth';
import { d1Feed } from '@/lib/database/d1-feed';
import { readD1Feed } from '@/lib/database/d1-feed-read';
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
    const db = getD1PreviewDatabase('auth');
    const d1Actor = db ? await d1FollowActor(db) : null;
    const actor = db ? null : await chatActor();
    const params = new URL(request.url).searchParams;
    const post = params.get("post_id") || undefined,
      profile = params.get("profile_id") || undefined;
    if (
      (post && !uuid.test(post)) ||
      (profile && !uuid.test(profile)) ||
      (!post && !profile)
    )
      return new NextResponse(null, { status: 400 });
    if (db) {
      const hash = d1Actor?.hash ?? null;
      if ((post && !await d1Feed(db).post(hash, post.toLowerCase())) ||
          (profile && !(await d1FollowState(db, hash, profile.toLowerCase()))?.allowed)) {
        return new NextResponse(null, { status: 404 });
      }
      const { posts } = await readD1Feed(db, hash, false, '', null, 100, {
        post: post?.toLowerCase() ?? null, profile: profile?.toLowerCase() ?? null,
      });
      if (profile) return NextResponse.json({ posts }, { headers: privateHeaders });
      const entries = posts.map(item => item.repost);
      return NextResponse.json({
        reposts: entries.map(({ id, author, comment }) => ({ id, author, comment })),
        nookled: entries.some(item => item.user_id === d1Actor?.id),
      }, { headers: privateHeaders });
    }
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
    const db = getD1PreviewDatabase('auth');
    const d1Actor = db ? await d1FollowActor(db) : null;
    const actor = db ? null : await chatActor();
    if (!actor && !d1Actor) return new NextResponse(null, { status: 401 });
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
    if (db && d1Actor) {
      const feed = d1Feed(db);
      const target = id.toLowerCase();
      if (!await feed.post(d1Actor.hash, target)) return new NextResponse(null, { status: 404 });
      try {
        if (!await d1Auth(db).consumeRateLimit(rateLimitKey('repost', d1Actor.id), 60, 3600)) {
          return new NextResponse(null, { status: 429 });
        }
      } catch {
        return new NextResponse(null, { status: 429 });
      }
      await feed.repost(d1Actor.hash, crypto.randomUUID(), target, comment);
      return NextResponse.json({ saved: true }, { headers: privateHeaders });
    }
    if (!actor) return new NextResponse(null, { status: 401 });
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
    const db = getD1PreviewDatabase('auth');
    const d1Actor = db ? await d1FollowActor(db) : null;
    const actor = db ? null : await chatActor();
    if (!actor && !d1Actor) return new NextResponse(null, { status: 401 });
    const body = await request.json();
    if (!uuid.test(body.post_id || ""))
      return new NextResponse(null, { status: 400 });
    if (db && d1Actor) {
      await d1Feed(db).unrepost(d1Actor.hash, body.post_id.toLowerCase());
      return NextResponse.json({ removed: true }, { headers: privateHeaders });
    }
    if (!actor) return new NextResponse(null, { status: 401 });
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
