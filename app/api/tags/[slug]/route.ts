import {isPublicStoryVisible} from '@/lib/moderation/content-visibility';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SECRET_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const { slug } = await context.params;

    if (!slug) {
      return NextResponse.json(
        { error: 'Tag não informada.' },
        { status: 400 }
      );
    }

    // =========================
    // BUSCA A TAG
    // =========================

    const { data: tag, error: tagError } = await supabase
      .from('tags')
      .select(`
        id,
        name,
        slug,
        category_id,
        tag_categories (
          id,
          name,
          slug
        )
      `)
      .eq('slug', slug)
      .maybeSingle();

    if (tagError) {
      console.error('Erro ao buscar tag:', tagError);

      return NextResponse.json(
        { error: 'Erro ao buscar tag.' },
        { status: 500 }
      );
    }

    if (!tag) {
      return NextResponse.json(
        { error: 'Tag não encontrada.' },
        { status: 404 }
      );
    }

    const category = Array.isArray(tag.tag_categories)
      ? tag.tag_categories[0]
      : tag.tag_categories;

    // =========================
    // BUSCA HISTÓRIAS DA TAG
    // =========================

    const { data: storyTags, error: storyTagsError } =
      await supabase
        .from('story_tags')
        .select(`
          story_id,
          stories (
            id,
            author_id,
            title,
            description,
            cover_url,
            status,
            rating,
            created_at,
            updated_at
          )
        `)
        .eq('tag_id', tag.id);

    if (storyTagsError) {
      console.error(
        'Erro ao buscar histórias da tag:',
        storyTagsError
      );

      return NextResponse.json(
        { error: 'Erro ao buscar histórias da tag.' },
        { status: 500 }
      );
    }

    const rawStories = (storyTags || [])
      .map((item: any) => item.stories)
      .filter(Boolean);

    // =========================
    // AUTORES
    // =========================

    const authorIds = [
      ...new Set(
        rawStories
          .map((story: any) => story.author_id)
          .filter(Boolean)
      ),
    ];

    let authors: any[] = [];

    if (authorIds.length > 0) {
      const { data: authorData, error: authorsError } =
        await supabase
          .from('profiles')
          .select(`
            id,
            username,
            display_name,
            avatar_url
          `)
          .in('id', authorIds);

      if (authorsError) {
        console.error(
          'Erro ao buscar autores:',
          authorsError
        );
      } else {
        authors = authorData || [];
      }
    }

    const authorMap = new Map(
      authors.map((author) => [author.id, author])
    );

    // =========================
    // MONTA RESULTADO
    // =========================

    const visible=[];for(const story of rawStories){if(!await isPublicStoryVisible(supabase,story.id))continue;const chapters=await supabase.from('chapters').select('id').eq('story_id',story.id).eq('published',true).limit(1);if(chapters.error)throw chapters.error;if(chapters.data?.length)visible.push(story);}
    const stories = visible.map((story: any) => ({
      ...story,
      author: authorMap.get(story.author_id) || null,
    }));

    return NextResponse.json({
      tag: {
        id: tag.id,
        name: tag.name,
        slug: tag.slug,
        category: category?.name || null,
        category_slug: category?.slug || null,
      },
      stories,
    },{headers:{'Cache-Control':'no-store, private',Vary:'Cookie'}});
  } catch (error) {
    console.error(
      'Erro inesperado na API da tag:',
      error
    );

    return NextResponse.json(
      { error: 'Erro interno do servidor.' },
      { status: 500 }
    );
  }
}
