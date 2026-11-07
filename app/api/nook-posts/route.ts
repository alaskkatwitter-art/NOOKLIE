import { isNewsArticle } from '@/lib/news/articles';
import { sameOrigin } from '@/lib/chat/server';
import { NextResponse } from 'next/server';
import { currentViewerProfileId } from '@/lib/moderation/content-visibility';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

const ALLOWED_REACTIONS = [
  '❤️',
  '😂',
  '😭',
  '😱',
  '👀',
  '🔥',
];


/*
 * GET
 *
 * Busca os posts do Meu Nook do usuário atualmente logado.
 *
 * Além dos dados básicos do post, retorna:
 * - autor
 * - mídias
 * - reações
 * - quantidade de comentários
 */
export async function GET() {
  try {
    const userId = await currentViewerProfileId(supabase);

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

    const { data: posts, error: postsError } =
      await supabase
        .from('nook_posts')
        .select(`
          id,
          user_id,
          body,
          image_url,
          story_id,news_slug,
          pinned,
          created_at,
          updated_at,
          moderation_hidden_at
        `)
        .eq('user_id', userId)
        .is('moderation_hidden_at', null)
        .order('pinned', {
          ascending: false,
        })
        .order('created_at', {
          ascending: false,
        });

    if (postsError) {
      console.error(
        'ERRO AO BUSCAR POSTS DO NOOK:',
        postsError
      );

      return NextResponse.json(
        {
          error: 'Erro ao buscar os posts.',
        },
        {
          status: 500,
        }
      );
    }

    const safePosts = posts || [];

    if (safePosts.length === 0) {
      return NextResponse.json({
        posts: [],
      });
    }

    const postIds = safePosts.map((post) => post.id);

    /*
     * Busca as mídias de todos os posts de uma vez.
     */
    const { data: media, error: mediaError } =
      await supabase
        .from('nook_post_media')
        .select(`
          id,
          post_id,
          media_url,
          media_type,
          created_at
        `)
        .in('post_id', postIds)
        .order('created_at', {
          ascending: true,
        });

    if (mediaError) {
      console.error(
        'ERRO AO BUSCAR MÍDIAS DOS POSTS:',
        mediaError
      );

      return NextResponse.json(
        {
          error: 'Erro ao buscar as mídias dos posts.',
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Busca todas as reações dos posts de uma vez.
     */
    const {
      data: reactions,
      error: reactionsError,
    } = await supabase
      .from('nook_post_reactions')
      .select(`
        post_id,
        user_id,
        emoji
      `)
      .in('post_id', postIds);

    if (reactionsError) {
      console.error(
        'ERRO AO BUSCAR REAÇÕES DOS POSTS:',
        reactionsError
      );

      return NextResponse.json(
        {
          error: 'Erro ao buscar as reações dos posts.',
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Busca todos os comentários dos posts apenas
     * para descobrir a quantidade.
     */
    const {
      data: comments,
      error: commentsError,
    } = await supabase
      .from('nook_comments')
      .select(`
        id,
        post_id
      `)
      .in('post_id', postIds);

    if (commentsError) {
      console.error(
        'ERRO AO BUSCAR COMENTÁRIOS DOS POSTS:',
        commentsError
      );

      return NextResponse.json(
        {
          error: 'Erro ao buscar os comentários dos posts.',
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Como o GET atual só traz posts do usuário logado,
     * usamos o próprio usuário autenticado como autor.
     *
     * Isso evita uma segunda consulta desnecessária.
     */
    const { data: author, error: authorError } =
      await supabase
        .from('profiles')
        .select(`
          id,
          username,
          display_name,
          avatar_url, verified, is_official
        `)
        .eq('id', userId)
        .maybeSingle();

    if (authorError) {
      console.error(
        'ERRO AO BUSCAR AUTOR DOS POSTS:',
        authorError
      );

      return NextResponse.json(
        {
          error: 'Erro ao buscar os dados do autor.',
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Monta os dados finais de cada post.
     */
    const enrichedPosts = safePosts.map((post) => {
      const postMedia =
        media?.filter(
          (item) => item.post_id === post.id
        ) || [];

      const postReactions =
        reactions?.filter(
          (reaction) =>
            reaction.post_id === post.id
        ) || [];

      const postComments =
        comments?.filter(
          (comment) =>
            comment.post_id === post.id
        ) || [];

      const reactionCounts: Record<string, number> =
        {};

      for (const emoji of ALLOWED_REACTIONS) {
        reactionCounts[emoji] = 0;
      }

      const userReactions: string[] = [];

      for (const reaction of postReactions) {
        if (
          typeof reaction.emoji === 'string' &&
          ALLOWED_REACTIONS.includes(reaction.emoji)
        ) {
          reactionCounts[reaction.emoji] =
            (reactionCounts[reaction.emoji] || 0) + 1;
        }

        if (reaction.user_id === userId) {
          userReactions.push(reaction.emoji);
        }
      }

      return {
        ...post,

        author: author
          ? {
              id: author.id,
              username: author.username,
              display_name: author.display_name,
              verified: author.verified,
              is_official: author.is_official,
              avatar_url: author.avatar_url,
            }
          : null,

        media: postMedia,

        reaction_counts: reactionCounts,

        user_reactions: userReactions,

        comments_count: postComments.length,
      };
    });

    return NextResponse.json({
      posts: enrichedPosts,
    });
  } catch (error) {
    console.error(
      'ERRO GERAL NA API DO NOOK:',
      error
    );

    return NextResponse.json(
      {
        error: 'Erro interno do servidor.',
      },
      {
        status: 500,
      }
    );
  }
}

/*
 * POST
 *
 * Cria um novo post no Meu Nook.
 */
export async function POST(request: Request) {
  try {
    if(!sameOrigin(request)) return new NextResponse(null,{status:403});
    const userId = await currentViewerProfileId(supabase);

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

    const body = await request.json();

    const text =
      typeof body.body === 'string'
        ? body.body.trim()
        : '';

    const imageUrl =
      typeof body.image_url === 'string' &&
      body.image_url.trim()
        ? body.image_url.trim()
        : null;

    const storyId =
      typeof body.story_id === 'string' &&
      body.story_id.trim()
        ? body.story_id.trim()
        : null;

    /*
     * A criação pode ter texto, imagem legada,
     * ou ambos.
     *
     * As mídias novas de até 4 arquivos continuam
     * sendo adicionadas posteriormente pela rota
     * /api/nook-posts/media.
     */
    const newsSlug = body.news_slug ?? null;
    if ((newsSlug !== null && !isNewsArticle(newsSlug)) || (newsSlug && storyId)) return NextResponse.json({error:'Selecione uma matéria ou uma história válida.'},{status:400});
    if (!text && !imageUrl && !newsSlug) {
      return NextResponse.json(
        {
          error:
            'O post precisa ter um texto ou uma imagem.',
        },
        {
          status: 400,
        }
      );
    }

    if (text.length > 5000) {
      return NextResponse.json(
        {
          error:
            'O post pode ter no máximo 5000 caracteres.',
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Se uma história for informada, verificamos
     * se ela pertence ao usuário.
     */
    if (storyId) {
      const {
        data: story,
        error: storyError,
      } = await supabase
        .from('released_stories')
        .select('id')
        .eq('id', storyId)
        .eq('author_id', userId)
        .maybeSingle();

      if (storyError) {
        console.error(
          'ERRO AO VALIDAR HISTÓRIA DO POST:',
          storyError
        );

        return NextResponse.json(
          {
            error:
              'Não foi possível validar a história.',
          },
          {
            status: 500,
          }
        );
      }

      if (!story) {
        return NextResponse.json(
          {
            error:
              'A história selecionada não pertence a você.',
          },
          {
            status: 403,
          }
        );
      }
    }

    const {
      data: post,
      error: postError,
    } = await supabase
      .from('nook_posts')
      .insert({
        user_id: userId,
        body: text,
        image_url: imageUrl,
        story_id: storyId,
        news_slug: newsSlug,
        pinned: false,
      })
      .select(`
        id,
        user_id,
        body,
        image_url,
        story_id,news_slug,
        pinned,
        created_at,
        updated_at
      `)
      .single();

    if (postError) {
      console.error(
        'ERRO AO CRIAR POST DO NOOK:',
        postError
      );

      return NextResponse.json(
        {
          error: 'Não foi possível criar o post.',
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Retornamos também o autor para que o post
     * recém-criado possa aparecer imediatamente
     * com avatar e username.
     */
    const {
      data: author,
      error: authorError,
    } = await supabase
      .from('profiles')
      .select(`
        id,
        username,
        display_name,
        avatar_url, verified, is_official
      `)
      .eq('id', userId)
      .maybeSingle();

    if (authorError) {
      console.error(
        'ERRO AO BUSCAR AUTOR DO NOVO POST:',
        authorError
      );
    }

    return NextResponse.json(
      {
        post: {
          ...post,

          author: author
            ? {
                id: author.id,
                username: author.username,
                display_name:
                  author.display_name,
                verified: author.verified,
                is_official: author.is_official,
                avatar_url:
                  author.avatar_url,
              }
            : null,

          media: [],

          reaction_counts: {
            '❤️': 0,
            '😂': 0,
            '😭': 0,
            '😱': 0,
            '👀': 0,
            '🔥': 0,
          },

          user_reactions: [],

          comments_count: 0,
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      'ERRO GERAL AO CRIAR POST DO NOOK:',
      error
    );

    return NextResponse.json(
      {
        error: 'Erro interno do servidor.',
      },
      {
        status: 500,
      }
    );
  }
}
