import { NextResponse } from 'next/server';
import { getSessionTokenHash } from '@/lib/auth/session';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1Books } from '@/lib/database/d1-books';
import { safeChapterHtml } from '@/lib/security/html';
import { mediaStorage } from '@/lib/media/storage';
import { chatDb as db, chatActor, sameOrigin, uuid, privateHeaders } from '@/lib/chat/server';

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
    const d1 = getD1PreviewDatabase('auth');
    const hash = d1 ? await getSessionTokenHash() : null;
    const actor = d1 ? null : await chatActor();
    const d1Actor = d1 && hash ? await d1.prepare('SELECT profile_id FROM d1_social_actors WHERE token_hash = ?')
      .bind(hash).first<{ profile_id: string }>() : null;
    if (!actor && !d1Actor) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: privateHeaders });
    const { id } = await params;
    if (!uuid.test(id)) return new NextResponse(null, { status: 400 });
    const raw = await request.text();
    if (raw.length > 80_000) return new NextResponse(null, { status: 413 });
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object') return new NextResponse(null, { status: 400 });
    const input = body as Record<string, unknown>;
    if (d1 && hash && d1Actor) {
      const owner = await d1.prepare('SELECT 1 FROM stories WHERE id = ? AND author_id = ?')
        .bind(id, d1Actor.profile_id).first();
      if (!owner) return NextResponse.json({ error: 'Obra não encontrada ou sem permissão.' }, { status: 403, headers: privateHeaders });
      const books = d1Books(d1, safeChapterHtml);
      if (input.action === 'reorder') {
        if (!Array.isArray(input.ids) || input.ids.length > 2000 || !input.ids.every(value => typeof value === 'string' && uuid.test(value))) {
          return NextResponse.json({ error: 'Ordem inválida.' }, { status: 400, headers: privateHeaders });
        }
        try {
          await books.reorderChapters(hash, id, input.ids);
        } catch {
          return NextResponse.json({ error: 'Não foi possível salvar a ordem. Atualize a página e tente novamente.' }, { status: 409, headers: privateHeaders });
        }
      } else if (input.action === 'delete') {
        const chapterId = input.chapterId;
        if (typeof chapterId !== 'string' || !uuid.test(chapterId)) return new NextResponse(null, { status: 400 });
        const chapter = await d1.prepare('SELECT 1 FROM chapters WHERE id = ? AND story_id = ?').bind(chapterId, id).first();
        if (!chapter) return NextResponse.json({ error: 'Capítulo não encontrado.' }, { status: 404, headers: privateHeaders });
        // The isolated database can contain copied references to live media.
        await books.deleteChapter(hash, id, chapterId);
      } else {
        return NextResponse.json({ error: 'Ação inválida.' }, { status: 400, headers: privateHeaders });
      }
      return NextResponse.json({ ok: true }, { headers: privateHeaders });
    }

    if (!actor) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: privateHeaders });
    const { data: story, error: ownerError } = await db.from('stories').select('id').eq('id', id).eq('author_id', actor.profileId).maybeSingle();
    if (ownerError) throw ownerError;
    if (!story) return NextResponse.json({ error: 'Obra não encontrada ou sem permissão.' }, { status: 403, headers: privateHeaders });

    if (input.action === 'reorder') {
      if (!Array.isArray(input.ids) || input.ids.length > 2000 || !input.ids.every((value) => typeof value === 'string' && uuid.test(value))) {
        return NextResponse.json({ error: 'Ordem inválida.' }, { status: 400, headers: privateHeaders });
      }
      const { error } = await db.rpc('nooklie_reorder_chapters', { p_story: id, p_ids: input.ids });
      if (error) return NextResponse.json({ error: 'Não foi possível salvar a ordem. Atualize a página e tente novamente.' }, { status: 409, headers: privateHeaders });
      return NextResponse.json({ ok: true }, { headers: privateHeaders });
    }

    if (input.action === 'delete') {
      const chapterId = input.chapterId;
      if (typeof chapterId !== 'string' || !uuid.test(chapterId)) return new NextResponse(null, { status: 400 });
      const { data: media, error: mediaError } = await db.from('chapter_media').select('media_url').eq('chapter_id', chapterId);
      if (mediaError) throw mediaError;
      const { data: deleted, error } = await db.rpc('nooklie_delete_chapter', { p_story: id, p_chapter: chapterId });
      if (error) throw error;
      if (!deleted) return NextResponse.json({ error: 'Capítulo não encontrado.' }, { status: 404, headers: privateHeaders });
      const prefix = '/storage/v1/object/public/chapter-media/';
      const paths = (media || []).flatMap((item) => {
        try {
          const url = new URL(item.media_url, 'https://nooklie.invalid');
          if (url.pathname.startsWith(prefix)) return [decodeURIComponent(url.pathname.slice(prefix.length))];
          if (url.pathname === '/api/content-media' && url.searchParams.get('bucket') === 'chapter-media') {
            const path = url.searchParams.get('path');
            return path ? [path] : [];
          }
        } catch {}
        return [];
      });
      if (paths.length) {
        const { error: storageError } = await mediaStorage(db, 'chapter-media').remove(paths);
        if (storageError) console.error('Chapter media cleanup failed:', storageError);
      }
      return NextResponse.json({ ok: true }, { headers: privateHeaders });
    }
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400, headers: privateHeaders });
  } catch (error) {
    console.error('Chapter management error:', error);
    return NextResponse.json({ error: 'Não foi possível concluir a operação.' }, { status: 500, headers: privateHeaders });
  }
}
