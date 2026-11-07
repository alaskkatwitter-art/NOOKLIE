import { NextResponse } from "next/server";
import {
  chatActor,
  chatDb,
  uuid,
  sameOrigin,
  privateHeaders,
} from "@/lib/chat/server";
import { randomUUID } from "node:crypto";
import { detectedMedia } from "@/lib/chat/safety";
import { videoMatchesType } from "@/lib/security/uploads";
import { chapterBannerTypes, maxChapterBannerBytes, youtubeBannerId } from "@/lib/stories/chapter-banner";

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm',
};
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
    if (Number(request.headers.get("content-length")) > maxChapterBannerBytes + 16_384)
      return NextResponse.json({ error: "Envie um arquivo de até 4 MB." }, { status: 413 });
    const form = await request.formData();
    const file = form.get("file");
    const link = form.get("youtube");
    let url: string | null = null;
    let path: string | undefined;
    const storage = chatDb.storage.from("chapter-media");
    if (typeof link === "string") {
      const video = youtubeBannerId(link);
      if (!video) return NextResponse.json({ error: "Informe um link válido do YouTube." }, { status: 400 });
      url = 'https://www.youtube.com/watch?v=' + video;
    } else if (form.get("remove") !== "true") {
      if (!(file instanceof File) || !file.size || file.size > maxChapterBannerBytes)
        return NextResponse.json({ error: "Escolha uma imagem ou vídeo de até 4 MB." }, { status: 400 });
      const buffer = Buffer.from(await file.arrayBuffer());
      const type = file.type.startsWith('video/') && videoMatchesType(buffer, file.type)
        ? file.type : detectedMedia(buffer);
      if (!type || !chapterBannerTypes.includes(type))
        return NextResponse.json({ error: "Use JPG, PNG, WebP, GIF, MP4 ou WebM." }, { status: 415 });
      path = `${actor.profileId}/${chapter.data.story_id}/${id}/banner-${randomUUID()}.${extensions[type]}`;
      const result = await storage.upload(path, buffer, { contentType: type, upsert: false });
      if (result.error) throw result.error;
      url = storage.getPublicUrl(path).data.publicUrl;
    }

    let update = chatDb.from("chapters")
      .update({ banner_url: url, updated_at: new Date().toISOString() })
      .eq("id", id);
    update = chapter.data.banner_url === null
      ? update.is("banner_url", null)
      : update.eq("banner_url", chapter.data.banner_url);
    const updated = await update.select("id").maybeSingle();
    if (updated.error || !updated.data) {
      if (path) await storage.remove([path]);
      if (updated.error) throw updated.error;
      return NextResponse.json({ error: "O banner mudou em outra aba. Atualize a página e tente novamente." }, { status: 409 });
    }
    const old = chapter.data.banner_url;
    const prefix = chatDb.storage.from("chapter-media").getPublicUrl("")
      .data.publicUrl;
    if (old && old !== url && old.startsWith(prefix)) {
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
