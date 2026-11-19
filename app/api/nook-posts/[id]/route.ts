import { normalizeHashtag } from '@/lib/social/feed-links';
import { getSessionTokenHash } from '@/lib/auth/session';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1Feed } from '@/lib/database/d1-feed';
import { isNewsArticle } from '@/lib/news/articles';
import { sameOrigin, uuid } from '@/lib/chat/server';
import { NextResponse } from 'next/server';
import { currentViewerProfileId } from '@/lib/moderation/content-visibility';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);


/*
 * PATCH
 *
 * Edita um post, fixa/desafixa ou altera
 * o conteúdo do post.
 *
 * O usuário só pode alterar os próprios posts.
 */
export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    if(!sameOrigin(request)) return new NextResponse(null,{status:403});
    const db = getD1PreviewDatabase('auth');
    const hash = db ? await getSessionTokenHash() : null;
    const actor = db && hash ? await db.prepare('SELECT profile_id FROM d1_social_actors WHERE token_hash=?').bind(hash).first<{profile_id:string}>() : null;
    const userId = db ? actor?.profile_id : await currentViewerProfileId(supabase);

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

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error: 'ID do post não informado.',
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Primeiro verificamos se o post existe
     * e pertence ao usuário logado.
     */
    const { data: existingPost, error: existingError } = db
      ? { data: await db.prepare('SELECT body,image_url,news_slug FROM nook_posts WHERE id=? AND user_id=? AND moderation_hidden_at IS NULL')
          .bind(id,userId).first<{body:string;image_url:string|null;news_slug:string|null}>(), error: null }
      : await supabase
        .from('nook_posts')
        .select(
          `
          id,
          user_id,
          body,
          image_url,
          story_id,news_slug,
          pinned
        `
        )
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();

    if (existingError) {
      console.error(
        'ERRO AO BUSCAR POST DO NOOK:',
        existingError
      );

      return NextResponse.json(
        {
          error: 'Erro ao buscar o post.',
        },
        {
          status: 500,
        }
      );
    }

    if (!existingPost) {
      return NextResponse.json(
        {
          error:
            'Post não encontrado ou você não tem permissão para alterá-lo.',
        },
        {
          status: 404,
        }
      );
    }

    const body = await request.json();

    /*
     * Permite alterar apenas os campos enviados.
     */
    const updates: {
      body?: string;
      image_url?: string | null;
      story_id?: string | null;
      news_slug?: string | null;
      pinned?: boolean;
    } = {};

    if (Object.prototype.hasOwnProperty.call(body, 'body')) {
      const text =
        typeof body.body === 'string'
          ? body.body.trim()
          : '';

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

      updates.body = text;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        'image_url'
      )
    ) {
      updates.image_url =
        typeof body.image_url === 'string' &&
        body.image_url.trim()
          ? body.image_url.trim()
          : null;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        'story_id'
      )
    ) {
      updates.story_id =
        typeof body.story_id === 'string' &&
        body.story_id.trim()
          ? body.story_id.trim()
          : null;
    }

    if (
      Object.prototype.hasOwnProperty.call(
        body,
        'pinned'
      )
    ) {
      if (typeof body.pinned !== 'boolean') {
        return NextResponse.json(
          {
            error:
              'O campo pinned precisa ser verdadeiro ou falso.',
          },
          {
            status: 400,
          }
        );
      }

      updates.pinned = body.pinned;
    }

    /*
     * Se estiver alterando a história,
     * verificamos se ela pertence ao usuário.
     */
    if (
      Object.prototype.hasOwnProperty.call(
        updates,
        'story_id'
      ) &&
      updates.story_id
    ) {
      const { data: story, error: storyError } = db
        ? { data: await db.prepare('SELECT id FROM stories WHERE id=? AND author_id=?').bind(updates.story_id,userId).first(), error: null }
        : await supabase
          .from('stories')
          .select('id')
          .eq('id', updates.story_id)
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

    if (Object.prototype.hasOwnProperty.call(body,'news_slug')) {
      if (body.news_slug !== null && !isNewsArticle(body.news_slug)) return NextResponse.json({error:'Matéria inválida.'},{status:400});
      updates.news_slug=body.news_slug;
      if(updates.news_slug) updates.story_id=null;
    }
    if(updates.story_id) updates.news_slug=null;
    /*
     * Impede que o usuário salve um post completamente vazio.
     */
    const finalBody =
      updates.body !== undefined
        ? updates.body
        : existingPost.body;

    const finalImage =
      updates.image_url !== undefined
        ? updates.image_url
        : existingPost.image_url;

    if (!finalBody && !finalImage && !(updates.news_slug === undefined ? existingPost.news_slug : updates.news_slug)) {
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

    /*
     * Se nenhum campo válido foi enviado.
     */
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        {
          error:
            'Nenhuma alteração foi enviada.',
        },
        {
          status: 400,
        }
      );
    }

    if (db && hash) {
      const fields = ['body','image_url','story_id','news_slug','pinned'] as const;
      const selected = fields.filter(field => updates[field] !== undefined);
      const assignments = selected.map(field => field + '=?');
      const values = selected.map(field => field === 'pinned' ? Number(updates.pinned) : updates[field] as string|null);
      if (updates.body !== undefined) {
        assignments.push('hashtags=?');
        values.push(JSON.stringify([...new Set((updates.body.match(/#[\p{L}\p{N}_-]+/gu) ?? []).map(normalizeHashtag).filter(Boolean))]));
      }
      const post = await db.prepare(`UPDATE nook_posts SET ${assignments.join(',')},
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=? AND user_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?)
        AND moderation_hidden_at IS NULL
        AND (? IS NULL OR EXISTS(SELECT 1 FROM stories WHERE id=? AND author_id=nook_posts.user_id))
        RETURNING id,user_id,body,image_url,story_id,news_slug,pinned,created_at,updated_at`)
        .bind(...values,id,hash,updates.story_id ?? null,updates.story_id ?? null).first<{pinned:number}>();
      return post ? NextResponse.json({ post: { ...post,pinned:Boolean(post.pinned) } })
        : NextResponse.json({ error: 'Post indisponível.' }, { status: 404 });
    }

    const { data: post, error } = await supabase
      .from('nook_posts')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select(
        `
        id,
        user_id,
        body,
        image_url,
        story_id,news_slug,
        pinned,
        created_at,
        updated_at
        `
      )
      .single();

    if (error) {
      console.error(
        'ERRO AO EDITAR POST DO NOOK:',
        error
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível atualizar o post.',
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json({
      post,
    });
  } catch (error) {
    console.error(
      'ERRO GERAL AO EDITAR POST DO NOOK:',
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
 * DELETE
 *
 * Exclui um post do Meu Nook.
 *
 * O usuário só pode excluir os próprios posts.
 */
export async function DELETE(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  if (!sameOrigin(request)) return new NextResponse(null, { status: 403 });

  try {
    const db = getD1PreviewDatabase('auth');
    if (db) {
      const hash = await getSessionTokenHash();
      const session = hash && await db.prepare('SELECT 1 FROM d1_social_actors WHERE token_hash=?').bind(hash).first();
      if (!hash || !session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
      const { id } = await context.params;
      if (!uuid.test(id)) return NextResponse.json({ error: 'ID do post inválido.' }, { status: 400 });
      const deleted = await d1Feed(db).remove(hash,id);
      return deleted ? NextResponse.json({ success: true, message: 'Post excluído com sucesso.', postId: deleted.id })
        : NextResponse.json({ error: 'Post não encontrado ou você não tem permissão para excluí-lo.' }, { status: 404 });
    }
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

    const { id } = await context.params;

    if (!uuid.test(id)) {
      return NextResponse.json(
        {
          error: 'ID do post inválido.',
        },
        {
          status: 400,
        }
      );
    }

    /*
     * O filtro user_id é importante:
     * mesmo conhecendo o ID de outro post,
     * um usuário não consegue apagá-lo.
     */
    const { data: deletedPost, error } =
      await supabase
        .from('nook_posts')
        .delete()
        .eq('id', id)
        .eq('user_id', userId)
        .select('id')
        .maybeSingle();

    if (error) {
      console.error(
        'ERRO AO EXCLUIR POST DO NOOK:',
        error
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível excluir o post.',
        },
        {
          status: 500,
        }
      );
    }

    if (!deletedPost) {
      return NextResponse.json(
        {
          error:
            'Post não encontrado ou você não tem permissão para excluí-lo.',
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Post excluído com sucesso.',
      postId: deletedPost.id,
    });
  } catch (error) {
    console.error(
      'ERRO GERAL AO EXCLUIR POST DO NOOK:',
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
