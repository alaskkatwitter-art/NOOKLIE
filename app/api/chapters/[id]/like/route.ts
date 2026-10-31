import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { isPublicStoryVisible } from '@/lib/moderation/content-visibility';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

async function getUserId(request: Request) {
  const cookieHeader =
    request.headers.get('cookie') || '';

  const match = cookieHeader.match(
    /(?:^|;\s*)toriland_session=([^;]+)/
  );

  if (!match?.[1]) {
    return null;
  }

  const token = decodeURIComponent(match[1]);

  const tokenHash = createHash('sha256')
    .update(token)
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
    new Date(session.expires_at).getTime() <=
      Date.now()
  ) {
    return null;
  }

  return session.user_id as string;
}

export async function GET(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error: 'Capítulo não informado.',
        },
        { status: 400 }
      );
    }

    const { count, error: countError } =
      await supabase
        .from('chapter_likes')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('chapter_id', id);

    if (countError) {
      console.error(
        'Erro ao contar curtidas:',
        countError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível carregar as curtidas.',
        },
        { status: 500 }
      );
    }

    const userId = await getUserId(request);

    let liked = false;

    if (userId) {
      const { data: existingLike } =
        await supabase
          .from('chapter_likes')
          .select('chapter_id')
          .eq('chapter_id', id)
          .eq('user_id', userId)
          .maybeSingle();

      liked = Boolean(existingLike);
    }

    return NextResponse.json({
      likes: count || 0,
      liked,
    });
  } catch (error) {
    console.error(
      'Erro ao carregar curtidas:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Não foi possível carregar as curtidas.',
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error: 'Capítulo não informado.',
        },
        { status: 400 }
      );
    }

    const userId = await getUserId(request);

    if (!userId) {
      return NextResponse.json(
        {
          error:
            'Você precisa estar logado para curtir capítulos.',
        },
        { status: 401 }
      );
    }

    const { data: chapter } =
      await supabase
        .from('chapters')
        .select('id, story_id, published')
        .eq('id', id)
        .eq('published', true)
        .maybeSingle();

    if (!chapter || !(await isPublicStoryVisible(supabase, chapter.story_id))) {
      return NextResponse.json(
        {
          error: 'Capítulo não encontrado.',
        },
        { status: 404 }
      );
    }

    const { data: existingLike } =
      await supabase
        .from('chapter_likes')
        .select('chapter_id')
        .eq('chapter_id', id)
        .eq('user_id', userId)
        .maybeSingle();

    let liked = false;

    if (existingLike) {
      const { error: deleteError } =
        await supabase
          .from('chapter_likes')
          .delete()
          .eq('chapter_id', id)
          .eq('user_id', userId);

      if (deleteError) {
        console.error(
          'Erro ao remover curtida:',
          deleteError
        );

        return NextResponse.json(
          {
            error:
              'Não foi possível remover a curtida.',
          },
          { status: 500 }
        );
      }

      liked = false;
    } else {
      const { error: insertError } =
        await supabase
          .from('chapter_likes')
          .insert({
            chapter_id: id,
            user_id: userId,
          });

      if (insertError) {
        console.error(
          'Erro ao criar curtida:',
          insertError
        );

        return NextResponse.json(
          {
            error:
              'Não foi possível curtir o capítulo.',
          },
          { status: 500 }
        );
      }

      liked = true;
    }

    const { count, error: countError } =
      await supabase
        .from('chapter_likes')
        .select('*', {
          count: 'exact',
          head: true,
        })
        .eq('chapter_id', id);

    if (countError) {
      console.error(
        'Erro ao atualizar contagem:',
        countError
      );
    }

    return NextResponse.json({
      likes: count || 0,
      liked,
    });
  } catch (error) {
    console.error(
      'Erro inesperado ao alternar curtida:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Não foi possível alterar a curtida.',
      },
      { status: 500 }
    );
  }
}
