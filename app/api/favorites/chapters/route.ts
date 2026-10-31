import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { isPublicStoryVisible } from '@/lib/moderation/content-visibility';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

export async function GET() {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta para ver seus capítulos favoritos.' }, { status: 401 });
    const { data, error } = await supabase.from('chapter_favorites')
      .select('id, created_at, chapters!inner(id, story_id, chapter_number, title, published, stories!inner(id, title, author_id, moderation_hidden_at))')
      .eq('user_id', user.userId).eq('chapters.published', true).order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    const favorites = [];
    for (const item of data || []) {
      const chapter = Array.isArray(item.chapters) ? item.chapters[0] : item.chapters;
      const story = Array.isArray(chapter?.stories) ? chapter.stories[0] : chapter?.stories;
      if (!chapter || !story || !(await isPublicStoryVisible(supabase, story.id))) continue;
      favorites.push({ id: item.id, created_at: item.created_at, chapter: { id: chapter.id, chapter_number: chapter.chapter_number, title: chapter.title }, story: { id: story.id, title: story.title } });
    }
    return NextResponse.json({ favorites }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/favorites/chapters:', error);
    return NextResponse.json({ error: 'Não foi possível carregar os capítulos favoritos.' }, { status: 500 });
  }
}
