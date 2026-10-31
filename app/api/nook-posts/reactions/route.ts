import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

const ALLOWED_EMOJIS = [
  '❤️',
  '😂',
  '😭',
  '😱',
  '👀',
  '🔥',
];

async function getCurrentUserId(request: Request) {
  const meResponse = await fetch(
    new URL('/api/auth/me', request.url),
    {
      headers: {
        cookie: (await cookies()).toString(),
      },
      cache: 'no-store',
    }
  );

  const meData = await meResponse.json();

  if (
    !meResponse.ok ||
    !meData.authenticated ||
    !meData.user?.id
  ) {
    return null;
  }

  return meData.user.id as string;
}

/*
 * POST
 *
 * Adiciona uma reação a um post.
 *
 * Se o usuário já tiver aquela reação,
 * ela é removida.
 *
 * Exemplo:
 *
 * ❤️ → adiciona
 * ❤️ novamente → remove
 */
export async function POST(request: Request) {
  try {
    const userId = await getCurrentUserId(request);

    if (!userId) {
      return NextResponse.json(
        {
          error: 'Não autenticado.',
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const postId =
      typeof body.post_id === 'string'
        ? body.post_id.trim()
        : '';

    const emoji =
      typeof body.emoji === 'string'
        ? body.emoji.trim()
        : '';

    if (!postId) {
      return NextResponse.json(
        {
          error: 'ID do post não informado.',
        },
        { status: 400 }
      );
    }

    if (!ALLOWED_EMOJIS.includes(emoji)) {
      return NextResponse.json(
        {
          error: 'Reação não permitida.',
        },
        { status: 400 }
      );
    }

    /*
     * Confirma que o post existe.
     */
    const { data: post, error: postError } =
      await supabase
        .from('nook_posts')
        .select('id')
        .eq('id', postId)
        .maybeSingle();

    if (postError) {
      console.error(
        'ERRO AO BUSCAR POST PARA REAÇÃO:',
        postError
      );

      return NextResponse.json(
        {
          error: 'Erro ao buscar o post.',
        },
        { status: 500 }
      );
    }

    if (!post) {
      return NextResponse.json(
        {
          error: 'Post não encontrado.',
        },
        { status: 404 }
      );
    }

    /*
     * Verifica se essa reação já existe.
     */
    const { data: existingReaction, error: reactionError } =
      await supabase
        .from('nook_post_reactions')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .eq('emoji', emoji)
        .maybeSingle();

    if (reactionError) {
      console.error(
        'ERRO AO VERIFICAR REAÇÃO:',
        reactionError
      );

      return NextResponse.json(
        {
          error: 'Erro ao verificar a reação.',
        },
        { status: 500 }
      );
    }

    /*
     * Se já existe, remove.
     */
    if (existingReaction) {
      const { error: deleteError } =
        await supabase
          .from('nook_post_reactions')
          .delete()
          .eq('id', existingReaction.id);

      if (deleteError) {
        console.error(
          'ERRO AO REMOVER REAÇÃO:',
          deleteError
        );

        return NextResponse.json(
          {
            error: 'Não foi possível remover a reação.',
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        reacted: false,
        emoji,
      });
    }

    /*
     * Caso contrário, cria a reação.
     */
    const { data: reaction, error: insertError } =
      await supabase
        .from('nook_post_reactions')
        .insert({
          post_id: postId,
          user_id: userId,
          emoji,
        })
        .select(
          'id, post_id, user_id, emoji, created_at'
        )
        .single();

    if (insertError) {
      console.error(
        'ERRO AO CRIAR REAÇÃO:',
        insertError
      );

      return NextResponse.json(
        {
          error: 'Não foi possível adicionar a reação.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        reacted: true,
        reaction,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      'ERRO GERAL NAS REAÇÕES:',
      error
    );

    return NextResponse.json(
      {
        error: 'Erro interno do servidor.',
      },
      { status: 500 }
    );
  }
}
