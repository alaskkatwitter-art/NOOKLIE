import { getSessionTokenHash } from '@/lib/auth/session';
import { getD1PreviewDatabase } from '@/lib/database/preview';
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

    const db = getD1PreviewDatabase('auth');
    if (db) {
      const headers = {'Cache-Control':'no-store, private',Vary:'Cookie'};
      const tag = await db.prepare(`SELECT t.id,t.name,t.slug,c.name AS category,c.slug AS category_slug
        FROM tags t LEFT JOIN tag_categories c ON c.id=t.category_id WHERE t.slug=?`)
        .bind(slug).first<{id:string}>();
      if (!tag) return NextResponse.json({error:'Tag não encontrada.'},{status:404,headers});
      const hash = await getSessionTokenHash();
      const result = await db.prepare(`WITH viewer AS (SELECT profile_id FROM d1_social_actors WHERE token_hash=?1)
        SELECT s.id,s.author_id,s.title,s.description,s.cover_url,s.status,s.rating,s.created_at,s.updated_at,
        json_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url,
          'verified',json(CASE WHEN p.verified THEN 'true' ELSE 'false' END),
          'is_official',json(CASE WHEN p.is_official THEN 'true' ELSE 'false' END)) AS author
        FROM story_tags x JOIN released_stories s ON s.id=x.story_id
        JOIN profiles p ON p.id=s.author_id AND p.moderation_hidden_at IS NULL
        JOIN auth_accounts a ON a.id=p.user_id AND a.account_status='active'
        WHERE x.tag_id=?2 AND (p.is_private=0 OR p.id=(SELECT profile_id FROM viewer) OR EXISTS(
          SELECT 1 FROM follows WHERE follower_id=(SELECT profile_id FROM viewer) AND following_id=p.id))
        AND NOT EXISTS(SELECT 1 FROM chat_blocks b WHERE
          (b.blocker_id=(SELECT profile_id FROM viewer) AND b.blocked_id=p.id)
          OR (b.blocker_id=p.id AND b.blocked_id=(SELECT profile_id FROM viewer)))
        ORDER BY s.updated_at DESC,s.id LIMIT 1000`).bind(hash,tag.id).all<{author:string}>();
      if (!result.success) throw Error('Unable to load tagged stories');
      return NextResponse.json({tag,stories:result.results.map(row=>({...row,author:JSON.parse(row.author)}))},{headers});
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
            avatar_url, verified, is_official
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
