import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { areUsersBlocked } from '@/lib/community/blocks';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SECRET_KEY!;

const supabase = createClient(
  supabaseUrl,
  supabaseKey
);

async function getCurrentUserId(
  request: Request
) {
  try {
    const cookieStore = await cookies();

    const response = await fetch(
      new URL('/api/auth/me', request.url),
      {
        headers: {
          cookie: cookieStore.toString(),
        },
        cache: 'no-store',
      }
    );

    const data = await response.json();

    if (
      !response.ok ||
      !data.authenticated ||
      !data.user?.id
    ) {
      return null;
    }

    return data.user.id as string;
  } catch {
    return null;
  }
}

async function getFollowCounts(
  userId: string
) {
  const [
    followersResult,
    followingResult,
  ] = await Promise.all([
    supabase
      .from('follows')
      .select('*', {
        count: 'exact',
        head: true,
      })
      .eq('following_id', userId),

    supabase
      .from('follows')
      .select('*', {
        count: 'exact',
        head: true,
      })
      .eq('follower_id', userId),
  ]);

  return {
    followers_count:
      followersResult.count ?? 0,

    following_count:
      followingResult.count ?? 0,
  };
}

/**
 * GET
 *
 * Retorna:
 * - quantidade de seguidores
 * - quantidade de pessoas seguindo
 * - se o usuário atual segue este perfil
 * - se é o próprio perfil
 *
 * /api/follows?user_id=ID_DO_PERFIL
 */
export async function GET(
  request: Request
) {
  try {
    const currentUserId =
      await getCurrentUserId(
        request
      );

    const url =
      new URL(request.url);

    const targetUserId =
      url.searchParams.get(
        'user_id'
      );

    if (!targetUserId) {
      return NextResponse.json(
        {
          error:
            'user_id é obrigatório.',
        },
        {
          status: 400,
        }
      );
    }

    const counts =
      await getFollowCounts(
        targetUserId
      );

    let isFollowing = false;

    if (
      currentUserId &&
      currentUserId !==
        targetUserId
    ) {
      const {
        data,
        error,
      } = await supabase
        .from('follows')
        .select('follower_id')
        .eq(
          'follower_id',
          currentUserId
        )
        .eq(
          'following_id',
          targetUserId
        )
        .maybeSingle();

      if (error) {
        console.error(
          'Erro ao verificar follow:',
          error
        );

        return NextResponse.json(
          {
            error:
              'Não foi possível verificar o follow.',
          },
          {
            status: 500,
          }
        );
      }

      isFollowing =
        !!data;
    }

    return NextResponse.json({
      followers_count:
        counts.followers_count,

      following_count:
        counts.following_count,

      is_following:
        isFollowing,

      is_self:
        currentUserId ===
        targetUserId,
    });
  } catch (error) {
    console.error(
      'GET /api/follows:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Erro interno.',
      },
      {
        status: 500,
      }
    );
  }
}

/**
 * POST
 *
 * Segue um usuário.
 */
export async function POST(
  request: Request
) {
  try {
    const currentUserId =
      await getCurrentUserId(
        request
      );

    if (!currentUserId) {
      return NextResponse.json(
        {
          error:
            'Você precisa estar logado.',
        },
        {
          status: 401,
        }
      );
    }

    const body =
      await request.json();

    const followingId =
      body?.following_id;

    if (!followingId) {
      return NextResponse.json(
        {
          error:
            'following_id é obrigatório.',
        },
        {
          status: 400,
        }
      );
    }

    if (
      currentUserId ===
      followingId
    ) {
      return NextResponse.json(
        {
          error:
            'Você não pode seguir a si mesmo.',
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: targetUser,
      error: targetError,
    } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', followingId)
      .maybeSingle();

    if (targetError) {
      console.error(
        'Erro ao procurar perfil:',
        targetError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível encontrar o usuário.',
        },
        {
          status: 500,
        }
      );
    }

    if (!targetUser) {
      return NextResponse.json(
        {
          error:
            'Usuário não encontrado.',
        },
        {
          status: 404,
        }
      );
    }

    if (await areUsersBlocked(supabase, currentUserId, followingId)) {
      return NextResponse.json(
        { error: 'Não é possível seguir este perfil.' },
        { status: 403 }
      );
    }

    const {
      data: existingFollow,
      error: existingError,
    } = await supabase
      .from('follows')
      .select('follower_id')
      .eq(
        'follower_id',
        currentUserId
      )
      .eq(
        'following_id',
        followingId
      )
      .maybeSingle();

    if (existingError) {
      console.error(
        'Erro ao verificar follow existente:',
        existingError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível verificar o follow.',
        },
        {
          status: 500,
        }
      );
    }

    if (!existingFollow) {
      const {
        error: insertError,
      } = await supabase
        .from('follows')
        .insert({
          follower_id:
            currentUserId,
          following_id:
            followingId,
        });

      if (insertError) {
        console.error(
          'Erro ao seguir usuário:',
          insertError
        );

        return NextResponse.json(
          {
            error:
              'Não foi possível seguir este usuário.',
          },
          {
            status: 500,
          }
        );
      }
    }

    const counts =
      await getFollowCounts(
        followingId
      );

    return NextResponse.json({
      following: true,

      followers_count:
        counts.followers_count,

      following_count:
        counts.following_count,
    });
  } catch (error) {
    console.error(
      'POST /api/follows:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Erro interno.',
      },
      {
        status: 500,
      }
    );
  }
}

/**
 * DELETE
 *
 * Deixa de seguir um usuário.
 */
export async function DELETE(
  request: Request
) {
  try {
    const currentUserId =
      await getCurrentUserId(
        request
      );

    if (!currentUserId) {
      return NextResponse.json(
        {
          error:
            'Você precisa estar logado.',
        },
        {
          status: 401,
        }
      );
    }

    const body =
      await request.json();

    const followingId =
      body?.following_id;

    if (!followingId) {
      return NextResponse.json(
        {
          error:
            'following_id é obrigatório.',
        },
        {
          status: 400,
        }
      );
    }

    const {
      error,
    } = await supabase
      .from('follows')
      .delete()
      .eq(
        'follower_id',
        currentUserId
      )
      .eq(
        'following_id',
        followingId
      );

    if (error) {
      console.error(
        'Erro ao deixar de seguir:',
        error
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível deixar de seguir.',
        },
        {
          status: 500,
        }
      );
    }

    const counts =
      await getFollowCounts(
        followingId
      );

    return NextResponse.json({
      following: false,

      followers_count:
        counts.followers_count,

      following_count:
        counts.following_count,
    });
  } catch (error) {
    console.error(
      'DELETE /api/follows:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Erro interno.',
      },
      {
        status: 500,
      }
    );
  }
}
