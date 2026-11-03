import { NextResponse } from "next/server";
import {
  chatActor,
  chatDb,
  uuid,
  sameOrigin,
  privateHeaders,
} from "@/lib/chat/server";
import crypto from "crypto";
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
    const actor = await chatActor();
    if (!actor) return new NextResponse(null, { status: 401 });
    const { id } = await params;
    if (!uuid.test(id)) return new NextResponse(null, { status: 400 });
    const chapter = await chatDb
      .from("chapters")
      .select("story_id,banner_url")
      .eq("id", id)
      .maybeSingle();
    if (chapter.error) throw chapter.error;
    if (!chapter.data) return new NextResponse(null, { status: 404 });
    const story = await chatDb
      .from("stories")
      .select("author_id")
      .eq("id", chapter.data.story_id)
      .single();
    if (story.error) throw story.error;
    if (story.data.author_id !== actor.profileId)
      return new NextResponse(null, { status: 403 });
    if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024)
      return new NextResponse(null, { status: 413 });
    const form = await request.formData();
    const file = form.get("file");
    let url: string | null = null;
    let path: string | undefined;
    if (form.get("remove") !== "true") {
      if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024)
        return NextResponse.json(
          { error: "Escolha uma imagem de até 5 MB." },
          { status: 400 },
        );
      const buffer = Buffer.from(await file.arrayBuffer());
      const ext = buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
        ? "jpg"
        : buffer
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? "png"
          : /^GIF8[79]a/.test(buffer.toString("ascii", 0, 6))
            ? "gif"
            : buffer.toString("ascii", 0, 4) === "RIFF" &&
                buffer.toString("ascii", 8, 12) === "WEBP"
              ? "webp"
              : null;
      if (!ext)
        return NextResponse.json(
          { error: "Use uma imagem JPG, PNG, WEBP ou GIF." },
          { status: 415 },
        );
      path = `${actor.profileId}/${chapter.data.story_id}/${id}/banner-${crypto.randomUUID()}.${ext}`;
      const result = await chatDb.storage
        .from("chapter-media")
        .upload(path, buffer, {
          contentType: ext === "jpg" ? "image/jpeg" : "image/" + ext,
          upsert: false,
        });
      if (result.error) throw result.error;
      url = chatDb.storage.from("chapter-media").getPublicUrl(path)
        .data.publicUrl;
    }
    const updated = await chatDb
      .from("chapters")
      .update({ banner_url: url, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updated.error) {
      if (path) await chatDb.storage.from("chapter-media").remove([path]);
      throw updated.error;
    }
    const old = chapter.data.banner_url;
    const prefix = chatDb.storage.from("chapter-media").getPublicUrl("")
      .data.publicUrl;
    if (old && old.startsWith(prefix)) {
      const oldPath = old.slice(prefix.length);
      if (oldPath.startsWith(`${actor.profileId}/`))
        await chatDb.storage.from("chapter-media").remove([oldPath]);
    }
    return NextResponse.json({ banner_url: url }, { headers: privateHeaders });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível alterar o banner." },
      { status: 503, headers: privateHeaders },
    );
  }
}
