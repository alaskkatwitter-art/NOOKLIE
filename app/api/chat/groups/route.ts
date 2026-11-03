import { NextResponse } from "next/server";
import {
  chatActor,
  chatDb,
  privateHeaders,
  sameOrigin,
} from "@/lib/chat/server";
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
    const actor = await chatActor();
    if (!actor) return new NextResponse(null, { status: 401 });
    const raw = await request.text();
    if (raw.length > 1600) return new NextResponse(null, { status: 400 });
    const body = JSON.parse(raw);
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.trim().length > 60 ||
      !Array.isArray(body.usernames) ||
      body.usernames.length < 1 ||
      body.usernames.length > 14 ||
      body.usernames.some(
        (n: unknown) => typeof n !== "string" || !/^[a-z0-9_]{3,30}$/.test(n),
      )
    )
      return NextResponse.json(
        { error: "Informe um nome e de 1 a 14 usernames válidos." },
        { status: 400 },
      );
    const names = [...new Set(body.usernames as string[])];
    const profiles = await chatDb
      .from("profiles")
      .select("id,username")
      .in("username", names)
      .is("moderation_hidden_at", null);
    if (profiles.error) throw profiles.error;
    if (profiles.data?.length !== names.length)
      return NextResponse.json(
        { error: "Um dos perfis não está disponível. Confira os usernames." },
        { status: 400, headers: privateHeaders },
      );
    const result = await chatDb.rpc("chat_group_create", {
      p_session: actor.sessionTokenHash,
      p_name: body.name.trim(),
      p_members: profiles.data.map((p) => p.id),
    });
    if (result.error)
      return NextResponse.json(
        {
          error:
            "Não foi possível criar o grupo. Confira os participantes e bloqueios ou aguarde antes de tentar novamente.",
        },
        { status: 409, headers: privateHeaders },
      );
    return NextResponse.json(
      { thread_id: result.data },
      { status: 201, headers: privateHeaders },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível criar o grupo." },
      { status: 503, headers: privateHeaders },
    );
  }
}
