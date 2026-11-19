import { getD1PreviewDatabase } from '@/lib/database/preview';
import { getSessionTokenHash } from '@/lib/auth/session';
import { readD1Feed } from '@/lib/database/d1-feed-read';
import { NextResponse } from "next/server";
import { chatActor, uuid, privateHeaders } from "@/lib/chat/server";
import { visiblePost } from "@/lib/social/posts";
export async function GET(request: Request) {
  try {
    const db = getD1PreviewDatabase('auth');
    if (db) {
      const hash = await getSessionTokenHash();
      if (!hash || !await db.prepare('SELECT 1 FROM d1_social_actors WHERE token_hash=?').bind(hash).first()) {
        return new NextResponse(null, { status: 401, headers: privateHeaders });
      }
      const id = new URL(request.url).searchParams.get('id') || '';
      if (!uuid.test(id)) return new NextResponse(null, { status: 400, headers: privateHeaders });
      const { posts: [post] } = await readD1Feed(db, hash, false, '', null, 1, undefined, id);
      return NextResponse.json(post ? { post } : { error: 'Publicação indisponível.' },
        { status: post ? 200 : 404, headers: privateHeaders });
    }
    const actor = await chatActor();
    if (!actor) return new NextResponse(null, { status: 401 });
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!uuid.test(id)) return new NextResponse(null, { status: 400 });
    const post = await visiblePost(id, actor.profileId);
    return NextResponse.json(
      post ? { post } : { error: "Publicação indisponível." },
      { status: post ? 200 : 404, headers: privateHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível abrir a publicação." },
      { status: 503, headers: privateHeaders },
    );
  }
}
