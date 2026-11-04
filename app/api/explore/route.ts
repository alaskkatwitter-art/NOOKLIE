import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { storyFormats, storyKinds } from '@/lib/stories/metadata';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabase = createClient(supabaseUrl, process.env.SUPABASE_SECRET_KEY!);

function slugify(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

type StoryRow = {
  id: string;
  author_id: string;
  story_kind?: string;
  story_format?: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  status: string | null;
  rating: string | null;
  created_at: string;
  updated_at: string;
};

async function getCurrentProfileId() {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('toriland_session')?.value;

    if (!sessionToken) {
      return null;
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(sessionToken)
      .digest('hex');

    const { data: session, error } = await supabase
      .from('auth_sessions')
      .select('user_id, expires_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (error || !session) {
      return null;
    }

    if (
      session.expires_at &&
      new Date(session.expires_at).getTime() <= Date.now()
    ) {
      return null;
    }

    /*
     * auth_sessions.user_id corresponde ao profiles.user_id.
     * O restante do Nooklie usa profiles.id para follows/stories.
     */
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', session.user_id)
      .maybeSingle();

    return profile?.id || null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || '').trim();
    if (query.length > 100) {
      return NextResponse.json({ error: 'A busca é muito longa.' }, { status: 400 });
    }

    const includedTagSlugs = Array.from(new Set([
      ...searchParams.getAll('includeTag').map(slugify),
      ...[searchParams.get('fandom'), searchParams.get('genre')].filter((value): value is string => Boolean(value)).map(slugify),
    ].filter(Boolean))).slice(0, 12);
    const excludedTagSlugs = Array.from(new Set(searchParams.getAll('excludeTag').map(slugify).filter(Boolean))).slice(0, 12);
    const rating = searchParams.get('rating') || null;
    const storyStatus = searchParams.get('status') || null;
    const kind = searchParams.get('kind') || null;
    const format = searchParams.get('format') || null;
    if ((kind && !Object.hasOwn(storyKinds, kind)) || (format && !Object.hasOwn(storyFormats, format))) {
      return NextResponse.json({ error: 'Tipo de obra ou formato inválido.' }, { status: 400 });
    }
    const sort = searchParams.get('sort') || 'updated';
    const requestedPage = Number(searchParams.get('page') || '1');
    if (!Number.isInteger(requestedPage) || requestedPage < 1 || requestedPage > 10000) {
      return NextResponse.json({ error: 'Página inválida.' }, { status: 400 });
    }

    if (rating && !['Livre', '10', '12', '14', '16', '18'].includes(rating)) {
      return NextResponse.json({ error: 'Classificação inválida.' }, { status: 400 });
    }
    if (storyStatus && !['Em andamento', 'Concluída'].includes(storyStatus)) {
      return NextResponse.json({ error: 'Status inválido.' }, { status: 400 });
    }
    if (!['updated', 'newest', 'debut', 'title_asc', 'title_desc'].includes(sort)) {
      return NextResponse.json({ error: 'Ordenação inválida.' }, { status: 400 });
    }

    const currentProfileId = await getCurrentProfileId();

    /*
     * =========================================================
     * USUÁRIOS
     * =========================================================
     */

    let users: Array<{
      id: string;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      verified: boolean;
    }> = [];
    let usersError: { message?: string } | null = null;
    const safeUserQuery = query.replace(/[^\p{L}\p{N}_ -]/gu, '').trim();
    if (safeUserQuery) {
      const result = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, verified')
        .or(`username.ilike.%${safeUserQuery}%,display_name.ilike.%${safeUserQuery}%`)
        .order('username', { ascending: true })
        .limit(20);
      users = result.data || [];
      usersError = result.error;
    }

    if (usersError) {
      console.error(
        'ERRO AO BUSCAR USUÁRIOS:',
        usersError
      );

      return NextResponse.json(
        { error: 'Erro ao buscar usuários.' },
        { status: 500 }
      );
    }

    /*
     * Verifica quem o usuário atual já segue.
     */

    let followingIds = new Set<string>();

    if (currentProfileId && users?.length) {
      const targetIds = users
        .map((user) => user.id)
        .filter((id) => id !== currentProfileId);

      if (targetIds.length > 0) {
        const { data: follows, error: followsError } =
          await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', currentProfileId)
            .in('following_id', targetIds);

        if (followsError) {
          console.error(
            'ERRO AO VERIFICAR FOLLOWS:',
            followsError
          );
        } else {
          followingIds = new Set(
            (follows || []).map(
              (follow) => follow.following_id
            )
          );
        }
      }
    }

    const publicUsers = (users || []).map((user) => ({
      ...user,
      is_following: followingIds.has(user.id),
      is_self: currentProfileId === user.id,
    }));

    /*
     * =========================================================
     * HISTÓRIAS
     * =========================================================
     */

    const { data: stories, error: storiesError } = await supabase.rpc('search_catalog_stories', {
      p_kind: kind,
      p_format: format,
      p_viewer: currentProfileId,
      p_query: query || null,
      p_include_slugs: includedTagSlugs,
      p_exclude_slugs: excludedTagSlugs,
      p_rating: rating,
      p_status: storyStatus,
      p_sort: sort,
      p_limit: 24,
      p_offset: (requestedPage - 1) * 24,
    });

    if (storiesError) {
      console.error(
        'ERRO AO BUSCAR HISTÓRIAS:',
        storiesError
      );

      return NextResponse.json(
        { error: 'Erro ao buscar histórias.' },
        { status: 500 }
      );
    }

    const storyRows = (stories || []) as StoryRow[];

    /*
     * =========================================================
     * AUTORES
     * =========================================================
     */

    const authorIds = Array.from(
      new Set(
        storyRows
          .map((story) => story.author_id)
          .filter(Boolean)
      )
    );

    let authors: {
      id: string;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
      verified: boolean;
    }[] = [];

    if (authorIds.length > 0) {
      const { data: authorRows, error: authorsError } =
        await supabase
          .from('profiles')
          .select(
            'id, username, display_name, avatar_url, verified'
          )
          .in('id', authorIds);

      if (authorsError) {
        console.error(
          'ERRO AO BUSCAR AUTORES:',
          authorsError
        );

        return NextResponse.json(
          { error: 'Erro ao carregar autores.' },
          { status: 500 }
        );
      }

      authors = authorRows || [];
    }

    const authorMap = new Map(
      authors.map((author) => [author.id, author])
    );

    /*
     * =========================================================
     * CAPÍTULOS PUBLICADOS
     * =========================================================
     */

    const storyIds = storyRows.map(
      (story) => story.id
    );

    let publishedStoryIds = new Set<string>();

    if (storyIds.length > 0) {
      const {
        data: publishedChapters,
        error: chaptersError,
      } = await supabase
        .from('chapters')
        .select('story_id')
        .in('story_id', storyIds)
        .eq('published', true);

      if (chaptersError) {
        console.error(
          'ERRO AO VERIFICAR CAPÍTULOS PUBLICADOS:',
          chaptersError
        );

        return NextResponse.json(
          {
            error:
              'Erro ao verificar histórias publicadas.',
          },
          { status: 500 }
        );
      }

      publishedStoryIds = new Set(
        (publishedChapters || []).map(
          (chapter) => chapter.story_id
        )
      );
    }

    const publicStoryRows = storyRows.filter(
      (story) => publishedStoryIds.has(story.id)
    );

    const tagsByStory = new Map<string, Array<{ name: string; slug: string; category: string | null }>>();
    if (publicStoryRows.length > 0) {
      const { data: tagRows, error: tagError } = await supabase
        .from('story_tags')
        .select('story_id, tags(name, slug, tag_categories(name))')
        .in('story_id', publicStoryRows.map((story) => story.id))
        .limit(1000);

      if (tagError) {
        console.error('ERRO AO BUSCAR TAGS DAS HISTÓRIAS:', tagError);
      } else {
        for (const row of tagRows || []) {
          const tag = Array.isArray(row.tags) ? row.tags[0] : row.tags;
          if (!tag) continue;
          const category = Array.isArray(tag.tag_categories) ? tag.tag_categories[0] : tag.tag_categories;
          const current = tagsByStory.get(row.story_id) || [];
          current.push({ name: tag.name, slug: tag.slug, category: category?.name || null });
          tagsByStory.set(row.story_id, current);
        }
      }
    }

    /*
     * =========================================================
     * HISTÓRIAS JÁ SALVAS NA BIBLIOTECA
     * =========================================================
     */

    let savedStoryIds = new Set<string>();

    if (
      currentProfileId &&
      publicStoryRows.length > 0
    ) {
      const { data: lists, error: listsError } =
        await supabase
          .from('reading_lists')
          .select('id')
          .eq('user_id', currentProfileId);

      if (!listsError && lists?.length) {
        const listIds = lists.map(
          (list) => list.id
        );

        const { data: savedItems, error: savedError } =
          await supabase
            .from('reading_list_items')
            .select('story_id')
            .in('list_id', listIds)
            .in(
              'story_id',
              publicStoryRows.map(
                (story) => story.id
              )
            );

        if (savedError) {
          console.error(
            'ERRO AO VERIFICAR BIBLIOTECA:',
            savedError
          );
        } else {
          savedStoryIds = new Set(
            (savedItems || []).map(
              (item) => item.story_id
            )
          );
        }
      }
    }

    const publicStories = publicStoryRows.map(
      (story) => ({
        id: story.id,
        title: story.title,
        story_kind: story.story_kind,
        story_format: story.story_format,
        description: story.description,
        cover_url: story.cover_url,
        status: story.status,
        rating: story.rating,
        tags: tagsByStory.get(story.id) || [],
        author: story.author_id
          ? authorMap.get(story.author_id) || null
          : null,
        is_saved: savedStoryIds.has(story.id),
        is_own_story:
          !!currentProfileId &&
          story.author_id === currentProfileId,
      })
    );

    return NextResponse.json({
      users: publicUsers,
      stories: publicStories,
      page: requestedPage,
      has_more: storyRows.length === 24,
      authenticated: !!currentProfileId,
    });
  } catch (error) {
    console.error(
      'ERRO GERAL NO EXPLORAR:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Erro interno ao realizar a busca.',
      },
      { status: 500 }
    );
  }
}
