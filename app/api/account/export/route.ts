import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);

async function allPages<T>(makeQuery: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await makeQuery(start, start + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
}

export async function GET() {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta para exportar seus dados.' }, { status: 401 });

    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('id, username, display_name, bio, avatar_url, cover_url, theme_color, created_at')
      .eq('user_id', user.userId).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });

    const [stories, comments, reviews, chapterFavorites, readingProgress, readingLists, authoredPosts, nookPosts] = await Promise.all([
      allPages((start, end) => supabase.from('stories').select('id, title, description, cover_url, status, rating, created_at, updated_at').eq('author_id', profile.id).order('created_at').range(start, end)),
      allPages((start, end) => supabase.from('comments').select('id, chapter_id, body, selected_text, start_offset, parent_comment_id, created_at, updated_at').eq('user_id', profile.id).order('created_at').range(start, end)),
      allPages((start, end) => supabase.from('story_reviews').select('id, story_id, rating, body, contains_spoilers, created_at, updated_at').eq('reviewer_id', profile.id).order('created_at').range(start, end)),
      allPages((start, end) => supabase.from('chapter_favorites').select('chapter_id, created_at').eq('user_id', profile.id).order('created_at').range(start, end)),
      allPages((start, end) => supabase.from('reading_progress').select('story_id, chapter_id, progress_percent, position, updated_at').eq('user_id', profile.id).order('updated_at').range(start, end)),
      allPages((start, end) => supabase.from('reading_lists').select('id, name, description, is_public, created_at').eq('user_id', profile.id).order('created_at').range(start, end)),
      allPages((start, end) => supabase.from('posts').select('id, body, quote_text, chapter_id, start_offset, end_offset, created_at').eq('user_id', profile.id).order('created_at').range(start, end)),
      allPages((start, end) => supabase.from('nook_posts').select('id, body, created_at, updated_at').eq('user_id', profile.id).order('created_at').range(start, end)),
    ]);

    const storyIds = stories.map((story) => story.id);
    const listIds = readingLists.map((list) => list.id);
    const [chapters, storyTags, readingListItems] = await Promise.all([
      storyIds.length ? allPages((start, end) => supabase.from('chapters').select('id, story_id, chapter_number, title, body, published, publication_status, author_notes, created_at, updated_at').in('story_id', storyIds).order('chapter_number').range(start, end)) : Promise.resolve([]),
      storyIds.length ? allPages((start, end) => supabase.from('story_tags').select('story_id, tag_id, tags(name, slug)').in('story_id', storyIds).range(start, end)) : Promise.resolve([]),
      listIds.length ? allPages((start, end) => supabase.from('reading_list_items').select('list_id, story_id, added_at').in('list_id', listIds).range(start, end)) : Promise.resolve([]),
    ]);

    const payload = {
      format: 'nooklie-data-export-v1',
      exported_at: new Date().toISOString(),
      account: profile,
      stories: stories.map((story) => ({ ...story, chapters: chapters.filter((chapter) => chapter.story_id === story.id), tags: storyTags.filter((item) => item.story_id === story.id) })),
      comments,
      reviews,
      chapter_favorites: chapterFavorites,
      reading_progress: readingProgress,
      reading_lists: readingLists.map((list) => ({ ...list, items: readingListItems.filter((item) => item.list_id === list.id) })),
      community_posts: authoredPosts,
      nook_posts: nookPosts,
      notes: ['Senhas, hashes de senha, chaves de recuperação, tokens de sessão e dados privados de terceiros não são incluídos neste arquivo.'],
    };
    const filename = `nooklie-export-${new Date().toISOString().slice(0, 10)}.json`;
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('GET /api/account/export:', error);
    return NextResponse.json({ error: 'Não foi possível exportar seus dados agora.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
