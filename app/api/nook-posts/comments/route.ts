import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { isPublicPostVisible } from '@/lib/moderation/content-visibility';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

async function getCurrentUserId() {
  const cookieStore = await cookies();

  const sessionToken =
    cookieStore.get('toriland_session')?.value;

  if (!sessionToken) {
    return null;
  }

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

  if (error) {
    console.error(
      'ERRO AO VERIFICAR SESSÃO:',
      error
    );

    return null;
  }

  if (!session) {
    return null;
  }

  if (
    new Date(session.expires_at).getTime() <=
    Date.now()
  ) {
    await supabase
      .from('auth_sessions')
      .delete()
      .eq('token_hash', tokenHash);

    return null;
  }

  return session.user_id as string;
}

/*
 * GET
 *
 * Busca todos os comentários de um post.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } =
      new URL(request.url);

    const postId =
      searchParams.get('post_id')?.trim() || '';

    if (!postId) {
      return NextResponse.json(
        {
          error:
            'ID do post não informado.',
        },
        { status: 400 }
      );
    }

    if (!(await isPublicPostVisible(supabase, postId))) {
      return NextResponse.json({ comments: [] });
    }

    const {
      data: comments,
      error,
    } = await supabase
      .from('nook_comments')
      .select(`
        id,
        post_id,
        author_id,
        content,
        parent_id,
        created_at,
        updated_at
      `)
      .eq('post_id', postId)
      .order('created_at', {
        ascending: true,
      });

    if (error) {
      console.error(
        'ERRO AO BUSCAR COMENTÁRIOS:',
        error
      );

      return NextResponse.json(
        {
          error:
            'Erro ao buscar comentários.',
        },
        { status: 500 }
      );
    }

    const authorIds = [
      ...new Set(
        (comments || []).map(
          (comment) =>
            comment.author_id
        )
      ),
    ];

    let profiles: Array<{
      id: string;
      username: string;
      display_name: string | null;
      avatar_url: string | null;
    }> = [];

    if (authorIds.length > 0) {
      const {
        data,
        error: profilesError,
      } = await supabase
        .from('profiles')
        .select(
          'id, username, display_name, avatar_url'
        )
        .in('id', authorIds);

      if (profilesError) {
        console.error(
          'ERRO AO BUSCAR AUTORES DOS COMENTÁRIOS:',
          profilesError
        );

        return NextResponse.json(
          {
            error:
              'Erro ao buscar autores dos comentários.',
          },
          { status: 500 }
        );
      }

      profiles = data || [];
    }

    const commentsWithAuthors =
      (comments || []).map(
        (comment) => ({
          ...comment,
          author:
            profiles.find(
              (profile) =>
                profile.id ===
                comment.author_id
            ) || null,
        })
      );

    return NextResponse.json({
      comments:
        commentsWithAuthors,
    });
  } catch (error) {
    console.error(
      'ERRO GERAL AO BUSCAR COMENTÁRIOS:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Erro interno do servidor.',
      },
      { status: 500 }
    );
  }
}

/*
 * POST
 *
 * Cria comentário ou resposta.
 *
 * parent_id:
 * null → comentário principal
 * ID   → resposta a outro comentário
 */
export async function POST(
  request: Request
) {
  try {
    /*
     * Descobre o usuário diretamente
     * pela sessão, sem fazer fetch interno
     * para /api/auth/me.
     */
    const userId =
      await getCurrentUserId();

    if (!userId) {
      return NextResponse.json(
        {
          error:
            'Não autenticado.',
        },
        { status: 401 }
      );
    }

    let body: any;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error:
            'Dados da requisição inválidos.',
        },
        { status: 400 }
      );
    }

    const postId =
      typeof body.post_id ===
      'string'
        ? body.post_id.trim()
        : '';

    const content =
      typeof body.content ===
      'string'
        ? body.content.trim()
        : '';

    const parentId =
      typeof body.parent_id ===
        'string' &&
      body.parent_id.trim()
        ? body.parent_id.trim()
        : null;

    if (!postId) {
      return NextResponse.json(
        {
          error:
            'ID do post não informado.',
        },
        { status: 400 }
      );
    }

    if (!content) {
      return NextResponse.json(
        {
          error:
            'O comentário não pode estar vazio.',
        },
        { status: 400 }
      );
    }

    if (content.length > 2000) {
      return NextResponse.json(
        {
          error:
            'O comentário pode ter no máximo 2000 caracteres.',
        },
        { status: 400 }
      );
    }

    /*
     * Confirma que o post existe.
     */
    const {
      data: post,
      error: postError,
    } = await supabase
      .from('nook_posts')
      .select('id')
      .eq('id', postId)
      .maybeSingle();

    if (postError) {
      console.error(
        'ERRO AO VALIDAR POST DO COMENTÁRIO:',
        postError
      );

      return NextResponse.json(
        {
          error:
            'Erro ao validar o post.',
        },
        { status: 500 }
      );
    }

    if (!post || !(await isPublicPostVisible(supabase, postId))) {
      return NextResponse.json(
        {
          error:
            'Post não encontrado.',
        },
        { status: 404 }
      );
    }

    /*
     * Se for resposta, confirma que:
     *
     * 1. o comentário existe;
     * 2. pertence ao mesmo post.
     */
    if (parentId) {
      const {
        data: parentComment,
        error: parentError,
      } = await supabase
        .from('nook_comments')
        .select(
          'id, post_id'
        )
        .eq('id', parentId)
        .maybeSingle();

      if (parentError) {
        console.error(
          'ERRO AO VALIDAR COMENTÁRIO PAI:',
          parentError
        );

        return NextResponse.json(
          {
            error:
              'Erro ao validar o comentário pai.',
          },
          { status: 500 }
        );
      }

      if (
        !parentComment
      ) {
        return NextResponse.json(
          {
            error:
              'O comentário ao qual você está respondendo não existe.',
          },
          { status: 400 }
        );
      }

      if (
        parentComment.post_id !==
        postId
      ) {
        return NextResponse.json(
          {
            error:
              'O comentário ao qual você está respondendo pertence a outro post.',
          },
          { status: 400 }
        );
      }
    }

    /*
     * Cria o comentário.
     */
    const {
      data: comment,
      error,
    } = await supabase
      .from('nook_comments')
      .insert({
        post_id: postId,
        author_id: userId,
        content,
        parent_id: parentId,
      })
      .select(`
        id,
        post_id,
        author_id,
        content,
        parent_id,
        created_at,
        updated_at
      `)
      .single();

    if (error) {
      console.error(
        'ERRO AO CRIAR COMENTÁRIO:',
        error
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível criar o comentário.',
        },
        { status: 500 }
      );
    }

    /*
     * Busca o perfil do autor.
     */
    const {
      data: author,
      error: authorError,
    } = await supabase
      .from('profiles')
      .select(
        'id, username, display_name, avatar_url'
      )
      .eq('id', userId)
      .maybeSingle();

    if (authorError) {
      console.error(
        'ERRO AO BUSCAR AUTOR DO COMENTÁRIO:',
        authorError
      );
    }

    /*
     * Retorna sempre JSON.
     */
    return NextResponse.json(
      {
        comment: {
          ...comment,
          author:
            author || null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      'ERRO GERAL AO CRIAR COMENTÁRIO:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Erro interno do servidor.',
      },
      { status: 500 }
    );
  }
}
