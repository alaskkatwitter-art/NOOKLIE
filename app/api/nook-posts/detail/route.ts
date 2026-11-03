import { NextResponse } from "next/server";
import { chatActor, uuid, privateHeaders } from "@/lib/chat/server";
import { visiblePost } from "@/lib/social/posts";
export async function GET(request: Request) {
  try {
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
