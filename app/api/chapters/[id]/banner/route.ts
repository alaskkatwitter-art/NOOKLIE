import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1FollowActor } from '@/lib/database/d1-follow-http';
import { getMediaBucket } from '@/lib/media/r2-binding';
import { mediaStorage } from '@/lib/media/storage';
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
    const db = getD1PreviewDatabase('auth');
    const previewActor = db ? await d1FollowActor(db) : null;
    const profileId = db ? previewActor?.id : (await chatActor())?.profileId;
    if (!profileId) return new NextResponse(null, { status: 401 });
    const { id } = await params;
    if (!uuid.test(id)) return new NextResponse(null, { status: 400 });
    let chapter: { story_id: string; banner_url: string | null; author_id: string } | null;
    if (db) {
      chapter = await db.prepare(`SELECT c.story_id,c.banner_url,s.author_id FROM chapters c
        JOIN stories s ON s.id=c.story_id WHERE c.id=? AND s.moderation_hidden_at IS NULL`)
        .bind(id).first<{ story_id: string; banner_url: string | null; author_id: string }>();
    } else {
      const result = await chatDb.from('chapters').select('story_id,banner_url').eq('id', id).maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return new NextResponse(null, { status: 404 });
      const story = await chatDb.from('stories').select('author_id').eq('id',result.data.story_id).single();
      if (story.error) throw story.error;
      chapter = { ...result.data, author_id: story.data.author_id };
    }
    if (!chapter) return new NextResponse(null, { status: 404 });
    if (chapter.author_id !== profileId) return new NextResponse(null, { status: 403 });
    if (Number(request.headers.get("content-length")) > maxChapterBannerBytes + 16_384)
      return NextResponse.json({ error: "Envie um arquivo de até 4 MB." }, { status: 413 });
    const form = await request.formData();
    const file = form.get("file");
    const link = form.get("youtube");
    let url: string | null = null;
    let path: string | undefined;
    const storage = db ? null : mediaStorage(chatDb, "chapter-media");
    const bucket = db ? getMediaBucket() : undefined;
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
      const name = `${profileId}/${chapter.story_id}/${id}/banner-${randomUUID()}.${extensions[type]}`;
      if (db) {
        path = 'd1-chapters/' + name;
        const result = await bucket?.put('chapter-media/' + path, buffer, {
          onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: type },
        });
        if (!result) throw Error('Unable to store banner');
        url = '/api/content-media?' + new URLSearchParams({ bucket: 'chapter-media', path });
      } else if (storage) {
        path = name;
        const result = await storage.upload(path, buffer, { contentType: type, upsert: false });
        if (result.error) throw result.error;
        url = storage.getPublicUrl(path).data.publicUrl;
      }
    }

    if (db && previewActor) {
      let saved = false;
      try {
        const updated = await db.prepare(`UPDATE chapters SET banner_url=?3,
          updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?2 AND banner_url IS ?4
          AND EXISTS (SELECT 1 FROM stories s JOIN d1_social_actors a ON a.profile_id=s.author_id
            WHERE s.id=chapters.story_id AND s.moderation_hidden_at IS NULL AND a.token_hash=?1)
          RETURNING id`).bind(previewActor.hash,id,url,chapter.banner_url).first<{ id: string }>();
        if (!updated) return NextResponse.json({ error: 'O banner mudou em outra aba. Atualize a página e tente novamente.' }, { status: 409 });
        saved = true;
      } finally {
        if (!saved && path) await bucket?.delete(['chapter-media/' + path]).catch(() => undefined);
      }
      const previous = chapter.banner_url?.startsWith('/api/content-media?')
        ? new URL(chapter.banner_url,request.url).searchParams.get('path') : null;
      if (previous?.startsWith(`d1-chapters/${profileId}/${chapter.story_id}/${id}/banner-`)) {
        await bucket?.delete(['chapter-media/' + previous]).catch(() => undefined);
      }
      return NextResponse.json({ banner_url: url }, { headers: privateHeaders });
    }
    if (!storage) throw Error('Media storage unavailable');
    let update = chatDb.from("chapters")
      .update({ banner_url: url, updated_at: new Date().toISOString() })
      .eq("id", id);
    update = chapter.banner_url === null
      ? update.is("banner_url", null)
      : update.eq("banner_url", chapter.banner_url);
    const updated = await update.select("id").maybeSingle();
    if (updated.error || !updated.data) {
      if (path) await storage.remove([path]);
      if (updated.error) throw updated.error;
      return NextResponse.json({ error: "O banner mudou em outra aba. Atualize a página e tente novamente." }, { status: 409 });
    }
    const old = chapter.banner_url;
    const prefix = mediaStorage(chatDb, "chapter-media").getPublicUrl("")
      .data.publicUrl;
    if (old && old !== url && old.startsWith(prefix)) {
      const oldPath = old.slice(prefix.length);
      if (oldPath.startsWith(`${profileId}/`))
        await mediaStorage(chatDb, "chapter-media").remove([oldPath]);
    }
    return NextResponse.json({ banner_url: url }, { headers: privateHeaders });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível alterar o banner." },
      { status: 503, headers: privateHeaders },
    );
  }
}
