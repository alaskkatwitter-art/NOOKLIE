import { spotifyUpdate } from '@/lib/spotify/resolve';
import { imageMatchesType } from '@/lib/security/uploads';
import { storyPublication } from '@/lib/stories/publication';
import { ensureCatalogTag } from '@/lib/stories/tags';
import bcrypt from 'bcryptjs';
import {chatActor,uuid,sameOrigin,privateHeaders} from '@/lib/chat/server';
import {rateLimitKey} from '@/lib/security/rate-key';
import { parseStoryMetadata } from '@/lib/stories/metadata';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { isPublicProfileVisible } from '@/lib/moderation/content-visibility';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL!;

const supabaseKey =
  process.env.SUPABASE_SECRET_KEY!;

const supabase = createClient(
  supabaseUrl,
  supabaseKey
);

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};


async function getSessionUserId() {
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

  const {
    data: session,
    error,
  } = await supabase
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
}

/*
 * ======================================================
 * LIBERA CAPÍTULOS AGENDADOS
 * ======================================================
 */

async function publishDueScheduledChapters(_storyId: string) {
 const result=await supabase.rpc('publish_scheduled_chapters');
 if(result.error)console.error('Erro ao liberar agendamentos:',result.error);
}

/*
 * ======================================================
 * GET - HISTÓRIA
 * ======================================================
 */

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const { id } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            'ID da história não informado.',
        },
        {
          status: 400,
        }
      );
    }

    const currentUserId =
      await getSessionUserId();

    /*
     * ==================================================
     * HISTÓRIA
     * ==================================================
     */

    const {
      data: story,
      error: storyError,
    } = await supabase
      .from('stories')
      .select(`
        id,
        author_id,
        title,
        description,
        spotify_link,
        cover_url,
        status,
        rating,
        story_kind, story_format, series_name, series_volume, has_content_warnings, fandom, work_has_ai, cover_has_ai, content_warnings, accepts_translation,
        created_at,
        updated_at,
        moderation_hidden_at, release_at
      `)
      .eq(
        'id',
        id
      )
      .is('moderation_hidden_at', null)
      .maybeSingle();

    if (storyError) {
      console.error(
        'Erro ao buscar história:',
        storyError
      );

      return NextResponse.json(
        {
          error:
            'Erro ao buscar história.',
        },
        {
          status: 500,
        }
      );
    }

    if (!story || !(await isPublicProfileVisible(supabase, story.author_id))) {
      return NextResponse.json(
        {
          error:
            'História não encontrada.',
        },
        {
          status: 404,
        }
      );
    }

    await publishDueScheduledChapters(id);
    const isOwner = currentUserId === story.author_id;
    const released = await supabase.from('released_stories').select('id').eq('id', id).maybeSingle();
    if (released.error) throw released.error;
    if (!released.data && !isOwner) {
      return NextResponse.json({ error: 'História não encontrada.' }, { status: 404, headers: privateHeaders });
    }

    if (new URL(request.url).searchParams.get('summary') === '1') {
      return NextResponse.json({ story: {
        id: story.id, title: story.title, description: story.description, cover_url: story.cover_url,
      } }, { headers: privateHeaders });
    }

    /*
     * ==================================================
     * LIBERA CAPÍTULOS AGENDADOS
     * ==================================================
     */


    /*
     * ==================================================
     * AUTOR
     * ==================================================
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
      .eq(
        'id',
        story.author_id
      )
      .maybeSingle();

    if (authorError) {
      console.error(
        'Erro ao buscar autor:',
        authorError
      );
    }

    /*
     * ==================================================
     * CAPÍTULOS
     * ==================================================
     *
     * IMPORTANTE:
     * Agora retornamos todos os campos usados
     * pelo editor de capítulos.
     */


    let chaptersQuery =
      supabase
        .from('chapters')
        .select(`
          id,
          story_id,
          chapter_number,
          entry_kind,
          title,
          body,
          published,
          publication_status,
          original_published_at,
          republished_at,
          created_at,
          updated_at
        `)
        .eq(
          'story_id',
          id
        );

    /*
     * Leitores só enxergam publicados.
     * O autor enxerga também rascunhos,
     * capítulos retirados do ar e agendados.
     */

    if (!isOwner) {
      chaptersQuery =
        chaptersQuery.eq(
          'published',
          true
        );
    }

    const {
      data: chapters,
      error: chaptersError,
    } =
      await chaptersQuery.order(
        'chapter_number',
        {
          ascending: true,
        }
      );

    if (chaptersError) {
      console.error(
        'Erro ao buscar capítulos:',
        chaptersError
      );

      return NextResponse.json(
        {
          error:
            'Erro ao buscar capítulos.',
        },
        {
          status: 500,
        }
      );
    }

    const storyChapters =
      chapters || [];

    /*
     * ==================================================
     * AGENDAMENTOS
     * ==================================================
     */

    let schedules: any[] =
      [];

    if (isOwner) {
      const chapterIds =
        storyChapters.map(
          (chapter) =>
            chapter.id
        );

      if (
        chapterIds.length > 0
      ) {
        const {
          data:
            scheduledChapters,
          error:
            schedulesError,
        } = await supabase
          .from(
            'scheduled_chapters'
          )
          .select(`
            id,
            chapter_id,
            scheduled_for,
            created_at,
            updated_at
          `)
          .in(
            'chapter_id',
            chapterIds
          );

        if (schedulesError) {
          console.error(
            'Erro ao buscar agendamentos:',
            schedulesError
          );
        } else {
          schedules =
            scheduledChapters ||
            [];
        }
      }
    }

    /*
     * ==================================================
     * JUNTA CAPÍTULOS + AGENDAMENTOS
     * ==================================================
     */

    const chaptersWithSchedule =
      storyChapters.map(
        (chapter) => {
          const schedule =
            schedules.find(
              (item) =>
                item.chapter_id ===
                chapter.id
            );

          return {
            ...chapter,

            scheduled_for:
              schedule?.scheduled_for ||
              null,

            is_scheduled:
              !!schedule &&
              !chapter.published,
          };
        }
      );

    /*
     * ==================================================
     * TAGS
     * ==================================================
     */

    const {
      data: storyTags,
      error: tagsError,
    } = await supabase
      .from('story_tags')
      .select(`
        tag_id,
        tags (
          id,
          name,
          slug,
          category_id,
          tag_categories (
            id,
            name,
            slug
          )
        )
      `)
      .eq(
        'story_id',
        id
      );

    if (tagsError) {
      console.error(
        'Erro ao buscar tags:',
        tagsError
      );
    }

    const tags = (
      storyTags || []
    )
      .map(
        (item: any) => {
          const tag =
            item.tags;

          if (!tag) {
            return null;
          }

          const category =
            Array.isArray(
              tag.tag_categories
            )
              ? tag
                  .tag_categories[0]
              : tag.tag_categories;

          return {
            id: tag.id,
            name: tag.name,
            slug: tag.slug,
            category:
              category?.name ||
              null,
            category_slug:
              category?.slug ||
              null,
          };
        }
      )
      .filter(Boolean);

    /*
     * ==================================================
     * CURTIDAS
     * ==================================================
     */

    const {
      count: likesCount,
      error: likesError,
    } = await supabase
      .from('story_likes')
      .select('*', {
        count: 'exact',
        head: true,
      })
      .eq(
        'story_id',
        id
      );

    if (likesError) {
      console.error(
        'Erro ao contar curtidas:',
        likesError
      );
    }

    /*
     * ==================================================
     * USUÁRIO CURTIU?
     * ==================================================
     */

    let liked =
      false;

    if (currentUserId) {
      const {
        data: like,
      } = await supabase
        .from('story_likes')
        .select(
          'story_id'
        )
        .eq(
          'story_id',
          id
        )
        .eq(
          'user_id',
          currentUserId
        )
        .maybeSingle();

      liked = !!like;
    }

    /*
     * ==================================================
     * RESPOSTA
     * ==================================================
     */

    const series = story.series_volume
      ? await supabase.rpc('list_story_series', { p_story: id, p_viewer: currentUserId })
      : null;

    return NextResponse.json(
      {
        story: {
          ...story,
          genre: tags.find(tag => tag?.category_slug === 'genre')?.name ?? '',
          fandom: story.fandom || tags.filter(tag => tag?.category_slug === 'fandom').map(tag => tag?.name).join(', '),
          publication: storyPublication(story.release_at, chaptersWithSchedule.some(chapter => chapter.published)),
          series_books: series?.data ?? [],

          author:
            author || null,

          tags,

          chapters:
            chaptersWithSchedule,

          likes:
            likesCount || 0,

          liked,
        },

        chapters:
          chaptersWithSchedule,
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
      'Erro inesperado na API da história:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Erro interno do servidor.',
      },
      {
        status: 500,

        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate',
        },
      }
    );
  }
}

/*
 * ======================================================
 * PUT - EDITAR HISTÓRIA
 * ======================================================
 */

export async function PUT(
  request: Request,
  context: RouteContext
) {
  let uploadedFilePath:
    | string
    | null = null;

  try {
    const { id } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            'ID da história não informado.',
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ==================================================
     * AUTENTICAÇÃO
     * ==================================================
     */

    const userId =
      await getSessionUserId();

    if (!userId) {
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

    /*
     * ==================================================
     * VERIFICA DONO
     * ==================================================
     */

    const {
      data: existingStory,
      error: existingError,
    } = await supabase
      .from('stories')
      .select(`
        id,
        author_id,
        title,
        description,
        spotify_link,
        cover_url,
        status,
        rating
      `)
      .eq(
        'id',
        id
      )
      .maybeSingle();

    if (existingError) {
      console.error(
        'Erro ao buscar história para edição:',
        existingError
      );

      return NextResponse.json(
        {
          error:
            'Erro ao buscar história.',
        },
        {
          status: 500,
        }
      );
    }

    if (!existingStory) {
      return NextResponse.json(
        {
          error:
            'História não encontrada.',
        },
        {
          status: 404,
        }
      );
    }

    if (
      existingStory.author_id !==
      userId
    ) {
      return NextResponse.json(
        {
          error:
            'Você não tem permissão para editar esta história.',
        },
        {
          status: 403,
        }
      );
    }

    /*
     * ==================================================
     * FORM DATA
     * ==================================================
     */

    const formData =
      await request.formData();
    let storyMetadata;
    try { storyMetadata = parseStoryMetadata(formData); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Dados inválidos.' }, { status: 400 }); }

    const music = await spotifyUpdate(formData.get('spotify_url') ?? undefined, existingStory.spotify_link, true);
    if (music instanceof NextResponse) return music;

    const title = String(formData.get('title') ?? existingStory.title ?? '').trim();
    const description = String(formData.get('description') ?? existingStory.description ?? '').trim();
    const status = String(formData.get('status') ?? existingStory.status ?? '').trim();
    const rating = String(formData.get('rating') ?? existingStory.rating ?? '').trim();

    const genre =
      String(
        formData.get(
          'genre'
        ) || ''
      ).trim();

    const tagNames = [...new Map(
      formData.getAll('tags').flatMap(value => typeof value === 'string' ? value.split(',') : [])
        .map(value => value.trim().replace(/^#+/, '').trim())
        .filter(Boolean).map(value => [value.toLocaleLowerCase('pt-BR'), value] as const)
    ).values()].slice(0, 30);
    if (tagNames.some(tag => tag.length > 80)) {
      return NextResponse.json({ error: 'Cada tag deve ter até 80 caracteres.' }, { status: 400 });
    }

    const cover =
      formData.get(
        'cover'
      );

    /*
     * ==================================================
     * VALIDAÇÕES
     * ==================================================
     */

    if (!title) {
      return NextResponse.json(
        {
          error:
            'O título é obrigatório.',
        },
        {
          status: 400,
        }
      );
    }

    if (
      title.length >
      150
    ) {
      return NextResponse.json(
        {
          error:
            'O título pode ter no máximo 150 caracteres.',
        },
        {
          status: 400,
        }
      );
    }

    if (
      description.length >
      5000
    ) {
      return NextResponse.json(
        {
          error:
            'A sinopse pode ter no máximo 5000 caracteres.',
        },
        {
          status: 400,
        }
      );
    }

    const allowedRatings =
      [
        '',
        'Livre',
        '10',
        '12',
        '14',
        '16',
        '18',
      ];

    if (
      !allowedRatings.includes(
        rating
      )
    ) {
      return NextResponse.json(
        {
          error:
            'Classificação inválida.',
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ==================================================
     * CAPA
     * ==================================================
     */

    let coverUrl =
      existingStory.cover_url ||
      null;

    if (
      cover instanceof File &&
      cover.size > 0
    ) {
      const allowedTypes =
        [
          'image/jpeg',
          'image/png',
          'image/webp',
          'image/gif',
        ];

      if (
        !allowedTypes.includes(
          cover.type
        )
      ) {
        return NextResponse.json(
          {
            error:
              'A capa precisa ser JPG, PNG, WEBP ou GIF.',
          },
          {
            status: 400,
          }
        );
      }

      if (
        cover.size >
        10 *
          1024 *
          1024
      ) {
        return NextResponse.json(
          {
            error:
              'A capa pode ter no máximo 10 MB.',
          },
          {
            status: 400,
          }
        );
      }


      if (!imageMatchesType(new Uint8Array(await cover.arrayBuffer()), cover.type)) {
        return NextResponse.json({ error: 'O conteúdo do arquivo não corresponde ao formato da imagem.' }, { status: 415 });
      }
      let extension =
        'gif';

      if (
        cover.type ===
        'image/jpeg'
      ) {
        extension =
          'jpg';
      } else if (
        cover.type ===
        'image/png'
      ) {
        extension =
          'png';
      } else if (
        cover.type ===
        'image/webp'
      ) {
        extension =
          'webp';
      }

      uploadedFilePath =
        userId +
        '/' +
        crypto.randomUUID() +
        '.' +
        extension;

      const {
        error: uploadError,
      } =
        await supabase.storage
          .from(
            'story-covers'
          )
          .upload(
            uploadedFilePath,
            cover,
            {
              contentType:
                cover.type,

              upsert:
                false,
            }
          );

      if (uploadError) {
        console.error(
          'Erro ao enviar nova capa:',
          uploadError
        );

        return NextResponse.json(
          {
            error:
              'Não foi possível enviar a capa.',
          },
          {
            status: 500,
          }
        );
      }

      const {
        data:
          publicUrlData,
      } =
        supabase.storage
          .from(
            'story-covers'
          )
          .getPublicUrl(
            uploadedFilePath
          );

      coverUrl =
        publicUrlData.publicUrl;
    }

    /*
     * ==================================================
     * ATUALIZA HISTÓRIA
     * ==================================================
     */

    let tagIds: string[] | null = null;
    if (formData.has('tags') || formData.has('genre')) {
      const categories = await supabase.from('tag_categories').select('id,slug');
      if (categories.error) throw categories.error;
      const categoryBySlug = new Map(categories.data.map(category => [category.slug, category.id]));
      const requestedTags = genre ? [genre, ...tagNames.filter(tag => tag.toLowerCase() !== genre.toLowerCase())] : tagNames;
      tagIds = [];
      for (const name of requestedTags) {
        const category = name === genre ? 'genre' : 'freeform';
        const tag = await ensureCatalogTag(supabase, name, categoryBySlug.get(category) ?? null, userId);
        if (tag) tagIds.push(tag.id);
      }
      tagIds = [...new Set(tagIds)];
    }

    const { data: updatedStory, error: updateError } = await supabase.rpc('save_story_details', {
      p_story: id,
      p_author: userId,
      p_changes: {
        ...storyMetadata,
        ...music,
        ...(formData.has('title') && { title }),
        ...(formData.has('description') && { description: description || null }),
        ...(formData.has('status') && { status: status || null }),
        ...(formData.has('rating') && { rating: rating || null }),
        ...(uploadedFilePath && { cover_url: coverUrl }),
      },
      p_tags: tagIds,
    });
    if (updateError) throw updateError;
    if (!updatedStory) throw new Error('Obra indisponível.');
    uploadedFilePath = null;

    return NextResponse.json({
      success:
        true,

      story:
        updatedStory,

      message:
        'História atualizada com sucesso.',
    });
  } catch (error) {
    console.error(
      'Erro inesperado ao editar história:',
      error
    );

    if (
      uploadedFilePath
    ) {
      try {
        await supabase.storage
          .from(
            'story-covers'
          )
          .remove([
            uploadedFilePath,
          ]);
      } catch {
        // ignora erro de limpeza
      }
    }

    return NextResponse.json(
      {
        error:
          (error as { code?: string } | null)?.code === '23505'
            ? 'Já existe um livro com esse número nesta série.'
            : 'Não foi possível salvar as alterações da obra.' ,
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(request:Request,{params}:RouteContext){
  try{
    if(!sameOrigin(request))return new NextResponse(null,{status:403});
    const actor=await chatActor();if(!actor)return NextResponse.json({error:'Entre na sua conta.'},{status:401,headers:privateHeaders});
    const {id}=await params;if(!uuid.test(id))return new NextResponse(null,{status:400});
    const raw=await request.text();if(raw.length>1000)return new NextResponse(null,{status:400});const body=JSON.parse(raw);
    if(typeof body.password!=='string'||!body.password||body.password.length>200)return NextResponse.json({error:'Digite sua senha.'},{status:400,headers:privateHeaders});
    const limit=await supabase.rpc('consume_auth_rate_limit',{p_key_hash:rateLimitKey('delete-story',actor.userId),p_limit:5,p_window_seconds:900});if(limit.error||!limit.data)return NextResponse.json({error:'Aguarde alguns minutos antes de tentar novamente.'},{status:429,headers:privateHeaders});
    const [story,account]=await Promise.all([supabase.from('stories').select('id,author_id').eq('id',id).maybeSingle(),supabase.from('auth_accounts').select('password_hash').eq('id',actor.userId).single()]);
    if(story.error||account.error)throw story.error||account.error;
    if(!story.data||story.data.author_id!==actor.profileId)return NextResponse.json({error:'História não encontrada.'},{status:404,headers:privateHeaders});
    if(!await bcrypt.compare(body.password,account.data.password_hash))return NextResponse.json({error:'Senha incorreta. A história foi mantida.'},{status:403,headers:privateHeaders});
    const {error}=await supabase.from('stories').delete().eq('id',id).eq('author_id',actor.profileId);if(error)throw error;
    return NextResponse.json({deleted:true},{headers:privateHeaders});
  }catch(error){console.error('DELETE story:',error);return NextResponse.json({error:'Não foi possível excluir a história.'},{status:503,headers:privateHeaders});}
}
