import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { getPublicProfileIds } from '@/lib/moderation/content-visibility';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

async function getCurrentUserId() {
  try {
    const cookieStore = await cookies();

    const sessionToken =
      cookieStore.get('toriland_session')?.value;

    if (!sessionToken) {
      return null;
    }

    const crypto = await import('crypto');

    const tokenHash = crypto
      .createHash('sha256')
      .update(sessionToken)
      .digest('hex');

    const { data: session, error } =
      await supabase
        .from('auth_sessions')
        .select('user_id, expires_at')
        .eq('token_hash', tokenHash)
        .maybeSingle();

    if (error || !session) {
      return null;
    }

    if (
      session.expires_at &&
      new Date(session.expires_at).getTime() <=
        Date.now()
    ) {
      return null;
    }

    return session.user_id;
  } catch (error) {
    console.error(
      'Erro ao verificar sessão:',
      error
    );

    return null;
  }
}

export async function GET() {
  try {
    // ======================================================
    // USUÁRIO LOGADO
    // ======================================================

    const userId =
      await getCurrentUserId();

    if (!userId) {
      return NextResponse.json(
        {
          error: 'Não autenticado.',
        },
        {
          status: 401,
        }
      );
    }

    // ======================================================
    // AUTORES SEGUIDOS
    // ======================================================

    const {
      data: follows,
      error: followsError,
    } = await supabase
      .from('follows')
      .select('following_id')
      .eq(
        'follower_id',
        userId
      );

    if (followsError) {
      console.error(
        'Erro ao buscar autores seguidos:',
        followsError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível carregar os autores seguidos.',
        },
        {
          status: 500,
        }
      );
    }

    const followingIds = [
      ...new Set(
        (follows || []).map(
          (follow) =>
            follow.following_id
        )
      ),
    ];

    if (
      followingIds.length === 0
    ) {
      return NextResponse.json({
        updates: [],
      });
    }

    const visibleFollowingIds = await getPublicProfileIds(
      supabase,
      followingIds
    );

    const publicFollowingIds = followingIds.filter((id) =>
      visibleFollowingIds.has(id)
    );

    if (publicFollowingIds.length === 0) {
      return NextResponse.json({ updates: [] });
    }

    // ======================================================
    // HISTÓRIAS DESSES AUTORES
    // ======================================================

    const {
      data: stories,
      error: storiesError,
    } = await supabase
      .from('stories')
      .select(`
        id,
        author_id,
        title,
        cover_url
      `)
      .in(
        'author_id',
        publicFollowingIds
      )
      .is('moderation_hidden_at', null);

    if (storiesError) {
      console.error(
        'Erro ao buscar histórias:',
        storiesError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível carregar as histórias.',
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
        updates: [],
      });
    }

    const storyIds =
      stories.map(
        (story) => story.id
      );

    // ======================================================
    // CAPÍTULOS AGENDADOS
    // ======================================================

    const {
      data: schedules,
      error: schedulesError,
    } = await supabase
      .from('scheduled_chapters')
      .select(`
        id,
        chapter_id,
        scheduled_for
      `)
      .gt(
        'scheduled_for',
        new Date().toISOString()
      )
      .order(
        'scheduled_for',
        {
          ascending: true,
        }
      );

    if (schedulesError) {
      console.error(
        'Erro ao buscar capítulos agendados:',
        schedulesError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível carregar as próximas atualizações.',
        },
        {
          status: 500,
        }
      );
    }

    if (
      !schedules ||
      schedules.length === 0
    ) {
      return NextResponse.json({
        updates: [],
      });
    }

    const chapterIds =
      schedules.map(
        (schedule) =>
          schedule.chapter_id
      );

    // ======================================================
    // CAPÍTULOS
    // ======================================================

    const {
      data: chapters,
      error: chaptersError,
    } = await supabase
      .from('chapters')
      .select(`
        id,
        story_id,
        chapter_number,
        title,
        published
      `)
      .in(
        'id',
        chapterIds
      );

    if (chaptersError) {
      console.error(
        'Erro ao buscar capítulos agendados:',
        chaptersError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível carregar os capítulos agendados.',
        },
        {
          status: 500,
        }
      );
    }

    // ======================================================
    // AUTORES
    // ======================================================

    const {
      data: profiles,
      error: profilesError,
    } = await supabase
      .from('profiles')
      .select(`
        id,
        username,
        display_name,
        avatar_url, verified, is_official
      `)
      .in(
        'id',
        publicFollowingIds
      );

    if (profilesError) {
      console.error(
        'Erro ao buscar perfis:',
        profilesError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível carregar os autores.',
        },
        {
          status: 500,
        }
      );
    }

    // ======================================================
    // MONTA ATUALIZAÇÕES
    // ======================================================

    const updates = schedules
      .map((schedule) => {
        const chapter =
          (chapters || []).find(
            (item) =>
              item.id ===
              schedule.chapter_id
          );

        if (!chapter) {
          return null;
        }

        /*
         * Garante que o capítulo realmente pertence
         * a uma história de um autor seguido.
         */
        const story =
          (stories || []).find(
            (item) =>
              item.id ===
              chapter.story_id
          );

        if (!story) {
          return null;
        }

        /*
         * Um capítulo agendado não deveria estar publicado.
         * Caso já esteja, não precisamos mostrar no calendário.
         */
        if (chapter.published) {
          return null;
        }

        const author =
          (profiles || []).find(
            (profile) =>
              profile.id ===
              story.author_id
          );

        if (!author) {
          return null;
        }

        return {
          id: schedule.id,

          chapter_id:
            chapter.id,

          story_id:
            story.id,

          chapter_number:
            chapter.chapter_number,

          chapter_title:
            chapter.title,

          story_title:
            story.title,

          story_cover_url:
            story.cover_url,

          scheduled_for:
            schedule.scheduled_for,

          author: {
            id: author.id,
            username:
              author.username,
            display_name:
              author.display_name,
            verified: author.verified,
            is_official: author.is_official,
            avatar_url:
              author.avatar_url,
          },
        };
      })
      .filter(Boolean);

    return NextResponse.json(
      {
        updates,
      },
      {
        status: 200,
        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (error) {
    console.error(
      'ERRO GERAL NAS PRÓXIMAS ATUALIZAÇÕES:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Erro interno do servidor.',
      },
      {
        status: 500,
      }
    );
  }
}
