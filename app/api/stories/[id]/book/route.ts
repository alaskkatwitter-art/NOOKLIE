import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isPublicProfileVisible } from '@/lib/moderation/content-visibility';
import { safeChapterHtml } from '@/lib/security/html';
import { privateHeaders, uuid } from '@/lib/chat/server';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const unavailable = () => NextResponse.json({ error: 'Download indisponível para esta obra.' }, { status: 404, headers: privateHeaders });
  if (!uuid.test(id)) return unavailable();

  try {
    const { data: released, error: releaseError } = await db.from('released_stories')
      .select('id, title, author_id').eq('id', id).is('moderation_hidden_at', null).maybeSingle();
    if (releaseError) throw releaseError;
    if (!released || !(await isPublicProfileVisible(db, released.author_id))) return unavailable();

    const [story, author] = await Promise.all([
      db.from('stories').select('allows_download').eq('id', id).maybeSingle(),
      db.from('profiles').select('username').eq('id', released.author_id).maybeSingle(),
    ]);
    if (story.error || author.error) throw story.error || author.error;
    if (!story.data?.allows_download || !author.data?.username) return unavailable();

    const chapters = [];
    const pageSize = 50;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await db.from('chapters').select('id, title, body')
        .eq('story_id', id).eq('published', true).order('chapter_number').order('id')
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      chapters.push(...data.map(chapter => ({ title: chapter.title, html: safeChapterHtml(chapter.body || '') })));
      if (data.length < pageSize) break;
    }
    if (!chapters.length) return unavailable();
    const [current, stillReleased] = await Promise.all([
      db.from('stories').select('allows_download').eq('id', id).maybeSingle(),
      db.from('released_stories').select('id').eq('id', id).maybeSingle(),
    ]);
    if (current.error || stillReleased.error) throw current.error || stillReleased.error;
    if (!current.data?.allows_download || !stillReleased.data || !(await isPublicProfileVisible(db, released.author_id))) {
      return unavailable();
    }

    return NextResponse.json({ id, title: released.title, author: author.data.username, chapters }, { headers: privateHeaders });
  } catch (error) {
    console.error('Erro ao preparar download da obra:', error);
    return NextResponse.json({ error: 'Não foi possível preparar o livro.' }, { status: 500, headers: privateHeaders });
  }
}
