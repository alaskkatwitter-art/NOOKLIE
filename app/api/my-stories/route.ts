import { storyPublication } from '@/lib/stories/publication';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function GET() {
  try {
    /* =====================================================
       SESSÃO
    ===================================================== */

    const cookieStore = await cookies();

    const sessionToken =
      cookieStore.get(
        'toriland_session'
      )?.value;

    if (!sessionToken) {
      return NextResponse.json(
        {
          error: 'Não autenticado.',
        },
        {
          status: 401,
        }
      );
    }

    const tokenHash =
      crypto
        .createHash('sha256')
        .update(sessionToken)
        .digest('hex');

    const {
      data: session,
      error: sessionError,
    } =
      await supabase
        .from('auth_sessions')
        .select(
          'user_id, expires_at'
        )
        .eq(
          'token_hash',
          tokenHash
        )
        .maybeSingle();

    if (sessionError) {
      console.error(
        'ERRO AO PROCURAR SESSÃO:',
        sessionError
      );

      return NextResponse.json(
        {
          error:
            'Erro ao verificar sessão.',
        },
        {
          status: 401,
        }
      );
    }

    if (!session) {
      return NextResponse.json(
        {
          error:
            'Sessão inválida.',
        },
        {
          status: 401,
        }
      );
    }

    if (
      new Date(
        session.expires_at
      ).getTime() <= Date.now()
    ) {
      await supabase
        .from('auth_sessions')
        .delete()
        .eq(
          'token_hash',
          tokenHash
        );

      return NextResponse.json(
        {
          error:
            'Sessão expirada.',
        },
        {
          status: 401,
        }
      );
    }

    const userId =
      session.user_id;

    /* =====================================================
       HISTÓRIAS DO USUÁRIO
       
       stories.author_id corresponde ao profiles.id.
    ===================================================== */

    const {
      data: profile,
      error: profileError,
    } =
      await supabase
        .from('profiles')
        .select(
          'id, user_id'
        )
        .eq(
          'user_id',
          userId
        )
        .maybeSingle();

    if (profileError) {
      console.error(
        'ERRO AO PROCURAR PERFIL:',
        profileError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível encontrar seu perfil.',
        },
        {
          status: 500,
        }
      );
    }

    if (!profile) {
      return NextResponse.json(
        {
          error:
            'Perfil não encontrado.',
        },
        {
          status: 404,
        }
      );
    }

    const authorId =
      profile.id;

    const {
      data: stories,
      error: storiesError,
    } =
      await supabase
        .from('stories')
        .select(
          `
            id,
            author_id,
            title,
            description,
            cover_url,
            status, fandom, release_at,
            created_at,
            updated_at,
            rating
          `
        )
        .eq(
          'author_id',
          authorId
        )
        .order(
          'updated_at',
          {
            ascending: false,
          }
        );

    if (storiesError) {
      console.error(
        'ERRO AO PROCURAR HISTÓRIAS:',
        storiesError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível carregar suas histórias.',
        },
        {
          status: 500,
        }
      );
    }

    if (
      !stories ||
      stories.length === 0
    ) {
      return NextResponse.json({
        stories: [],
      });
    }

    /* =====================================================
       CAPÍTULOS
    ===================================================== */

    const storyIds =
      stories.map(
        (story) => story.id
      );

    const {
      data: chapters,
      error: chaptersError,
    } =
      await supabase
        .from('chapters')
        .select(
          'id, story_id, published'
        )
        .in(
          'story_id',
          storyIds
        );

    if (chaptersError) {
      console.error(
        'ERRO AO PROCURAR CAPÍTULOS:',
        chaptersError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível carregar os capítulos.',
        },
        {
          status: 500,
        }
      );
    }

    /* =====================================================
       CURTIDAS
    ===================================================== */

    const {
      data: likes,
      error: likesError,
    } =
      await supabase
        .from('story_likes')
        .select(
          'story_id'
        )
        .in(
          'story_id',
          storyIds
        );

    if (likesError) {
      console.error(
        'ERRO AO PROCURAR CURTIDAS:',
        likesError
      );
    }

    /* =====================================================
       CONTADORES
    ===================================================== */

    const chapterCountByStory =
      new Map<string, number>();

    for (const chapter of
      chapters || []) {
      chapterCountByStory.set(
        chapter.story_id,
        (chapterCountByStory.get(
          chapter.story_id
        ) || 0) + 1
      );
    }

    const publishedIds = new Set((chapters || []).filter(chapter => chapter.published).map(chapter => chapter.story_id));

    const likesCountByStory =
      new Map<string, number>();

    for (const like of
      likes || []) {
      likesCountByStory.set(
        like.story_id,
        (likesCountByStory.get(
          like.story_id
        ) || 0) + 1
      );
    }

    /* =====================================================
       RESPOSTA
    ===================================================== */

    const result =
      stories.map(
        (story) => ({
          id: story.id,
          author_id:
            story.author_id,
          title:
            story.title,
          description:
            story.description,
          cover_url:
            story.cover_url,
          status: storyPublication(story.release_at, publishedIds.has(story.id)),
          editorial_status: story.status,
          created_at:
            story.created_at,
          updated_at:
            story.updated_at,
          rating:
            story.rating,

          chapters_count:
            chapterCountByStory.get(
              story.id
            ) || 0,

          likes_count:
            likesCountByStory.get(
              story.id
            ) || 0,

          views_count:
            0,

          genre:
            null,

          fandom: story.fandom,
        })
      );

    return NextResponse.json({
      stories: result,
    });
  } catch (error) {
    console.error(
      'ERRO GERAL EM /api/my-stories:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Erro interno ao carregar suas histórias.',
      },
      {
        status: 500,
      }
    );
  }
}
