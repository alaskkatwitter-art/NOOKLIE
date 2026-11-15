import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { chatActor, sameOrigin, uuid, privateHeaders } from '@/lib/chat/server';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });
    const actor = await chatActor();
    if (!actor) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: privateHeaders });
    const { id } = await params;
    if (!uuid.test(id)) return new NextResponse(null, { status: 400 });
    const raw = await request.text();
    if (raw.length > 16000) return new NextResponse(null, { status: 413 });
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object') return new NextResponse(null, { status: 400 });
    const input = body as Record<string, unknown>;
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
        const url = item.media_url as string;
        const index = url.indexOf(prefix);
        return index < 0 ? [] : [decodeURIComponent(url.slice(index + prefix.length).split('?')[0])];
      });
      if (paths.length) {
        const { error: storageError } = await db.storage.from('chapter-media').remove(paths);
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
