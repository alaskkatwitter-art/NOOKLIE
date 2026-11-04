import { NextResponse } from 'next/server';
import { currentViewerProfileId } from '@/lib/moderation/content-visibility';
import { createClient } from '@supabase/supabase-js';
import { isPublicPostVisible } from '@/lib/moderation/content-visibility';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);


/*
 * GET
 *
 * Verifica se um post está salvo
 * pelo usuário atual.
 *
 * Também pode receber:
 *
 * /api/nook-posts/save?post_id=...
 */
export async function GET(request: Request) {
  try {
    const userId = await currentViewerProfileId(supabase);

    if (!userId) {
      return NextResponse.json(
        {
          error: 'Não autenticado.',
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);

    const postId =
      searchParams.get('post_id')?.trim() || '';

    if (!postId) {
      return NextResponse.json(
        {
          error: 'ID do post não informado.',
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('nook_saved_posts')
      .select('id')
      .eq('user_id', userId)
      .eq('post_id', postId)
      .maybeSingle();

    if (error) {
      console.error(
        'ERRO AO VERIFICAR POST SALVO:',
        error
      );

      return NextResponse.json(
        {
          error: 'Não foi possível verificar o post salvo.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      saved: !!data,
    });
  } catch (error) {
    console.error(
      'ERRO GERAL AO VERIFICAR POST SALVO:',
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

/*
 * POST
 *
 * Salva ou remove um post dos salvos.
 *
 * Funcionamento:
 *
 * primeiro clique  → salva
 * segundo clique   → remove
 */
export async function POST(request: Request) {
  try {
    const userId = await currentViewerProfileId(supabase);

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

    if (!postId) {
      return NextResponse.json(
        {
          error: 'ID do post não informado.',
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
        'ERRO AO BUSCAR POST PARA SALVAR:',
        postError
      );

      return NextResponse.json(
        {
          error: 'Erro ao buscar o post.',
        },
        { status: 500 }
      );
    }

    if (!post || !(await isPublicPostVisible(supabase, postId))) {
      return NextResponse.json(
        {
          error: 'Post não encontrado.',
        },
        { status: 404 }
      );
    }

    /*
     * Verifica se já está salvo.
     */
    const {
      data: existingSave,
      error: existingError,
    } = await supabase
      .from('nook_saved_posts')
      .select('id')
      .eq('user_id', userId)
      .eq('post_id', postId)
      .maybeSingle();

    if (existingError) {
      console.error(
        'ERRO AO VERIFICAR SALVAMENTO:',
        existingError
      );

      return NextResponse.json(
        {
          error: 'Erro ao verificar o salvamento.',
        },
        { status: 500 }
      );
    }

    /*
     * Já salvo → remove.
     */
    if (existingSave) {
      const { error: deleteError } =
        await supabase
          .from('nook_saved_posts')
          .delete()
          .eq('id', existingSave.id);

      if (deleteError) {
        console.error(
          'ERRO AO REMOVER POST SALVO:',
          deleteError
        );

        return NextResponse.json(
          {
            error: 'Não foi possível remover o post dos salvos.',
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        saved: false,
      });
    }

    /*
     * Ainda não salvo → cria.
     */
    const { data: savedPost, error: insertError } =
      await supabase
        .from('nook_saved_posts')
        .insert({
          user_id: userId,
          post_id: postId,
        })
        .select(
          'id, user_id, post_id, created_at'
        )
        .single();

    if (insertError) {
      console.error(
        'ERRO AO SALVAR POST:',
        insertError
      );

      return NextResponse.json(
        {
          error: 'Não foi possível salvar o post.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        saved: true,
        saved_post: savedPost,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      'ERRO GERAL AO SALVAR POST:',
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
