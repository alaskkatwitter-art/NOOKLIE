import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { isPublicProfileVisible } from '@/lib/moderation/content-visibility';
import { getStoryEditAccess } from '@/lib/stories/access';

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

function createSlug(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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

async function publishDueScheduledChapters(
  storyId: string
) {
  const now =
    new Date().toISOString();

  const {
    data: schedules,
    error: scheduleError,
  } = await supabase
    .from('scheduled_chapters')
    .select(`
      id,
      chapter_id,
      scheduled_for
    `)
    .lte(
      'scheduled_for',
      now
    );

  if (scheduleError) {
    console.error(
      'Erro ao buscar capítulos agendados:',
      scheduleError
    );

    return;
  }

  if (
    !schedules ||
    schedules.length === 0
  ) {
    return;
  }

  for (const schedule of schedules) {
    const {
      data: chapter,
      error: chapterError,
    } = await supabase
      .from('chapters')
      .select(`
        id,
        story_id,
        published
      `)
      .eq(
        'id',
        schedule.chapter_id
      )
      .maybeSingle();

    if (chapterError) {
      console.error(
        'Erro ao verificar capítulo agendado:',
        chapterError
      );

      continue;
    }

    if (!chapter) {
      await supabase
        .from('scheduled_chapters')
        .delete()
        .eq(
          'id',
          schedule.id
        );

      continue;
    }

    if (
      chapter.story_id !==
      storyId
    ) {
      continue;
    }

    if (chapter.published) {
      await supabase
        .from('scheduled_chapters')
        .delete()
        .eq(
          'id',
          schedule.id
        );

      continue;
    }

    const {
      error: publishError,
    } = await supabase
      .from('chapters')
      .update({
        published: true,
        publication_status:
          'published',
      })
      .eq(
        'id',
        chapter.id
      )
      .eq(
        'story_id',
        storyId
      );

    if (publishError) {
      console.error(
        'Erro ao publicar capítulo agendado:',
        publishError
      );

      continue;
    }

    const {
      error: deleteScheduleError,
    } = await supabase
      .from('scheduled_chapters')
      .delete()
      .eq(
        'id',
        schedule.id
      );

    if (deleteScheduleError) {
      console.error(
        'Erro ao remover agendamento:',
        deleteScheduleError
      );
    }
  }
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
        cover_url,
        status,
        rating,
        created_at,
        updated_at,
        moderation_hidden_at,
        is_anonymous
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

    const editAccess = currentUserId
      ? await getStoryEditAccess(supabase, id, currentUserId)
      : { canEdit: false, isOwner: false };

    /*
     * ==================================================
     * LIBERA CAPÍTULOS AGENDADOS
     * ==================================================
     */

    await publishDueScheduledChapters(
      id
    );

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
        avatar_url
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

    const isOwner =
      currentUserId ===
      story.author_id;

    let chaptersQuery =
      supabase
        .from('chapters')
        .select(`
          id,
          story_id,
          chapter_number,
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

    return NextResponse.json(
      {
        story: {
          ...story,
          can_edit: editAccess.canEdit,
          can_manage_anonymity: currentUserId === story.author_id,
          author_id: story.is_anonymous && currentUserId !== story.author_id ? null : story.author_id,
          author_label: story.is_anonymous ? 'Autor anônimo' : null,
          author: story.is_anonymous && currentUserId !== story.author_id ? null : author || null,

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

    const editAccess = await getStoryEditAccess(supabase, id, userId);
    if (!editAccess.canEdit) {
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

    const title =
      String(
        formData.get(
          'title'
        ) || ''
      ).trim();

    const description =
      String(
        formData.get(
          'description'
        ) || ''
      ).trim();

    const status =
      String(
        formData.get(
          'status'
        ) || ''
      ).trim();

    const rating =
      String(
        formData.get(
          'rating'
        ) || ''
      ).trim();

    const genre =
      String(
        formData.get(
          'genre'
        ) || ''
      ).trim();

    const tagsText =
      String(
        formData.get(
          'tags'
        ) || ''
      );

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

    const { error: historyError } = await supabase.from('story_edit_history').insert({
      story_id: id,
      actor_id: userId,
      entity_type: 'story',
      entity_id: id,
      snapshot: existingStory,
    });
    if (historyError) throw historyError;

    const {
      data: updatedStory,
      error: updateError,
    } = await supabase
      .from('stories')
      .update({
        title,

        description:
          description ||
          null,

        cover_url:
          coverUrl,

        status:
          status ||
          null,

        rating:
          rating ||
          null,

        updated_at:
          new Date().toISOString(),
      })
      .eq(
        'id',
        id
      )
      .eq(
        'author_id',
        userId
      )
      .select(`
        id,
        author_id,
        title,
        description,
        cover_url,
        status,
        rating,
        created_at,
        updated_at
      `)
      .single();

    if (updateError) {
      console.error(
        'Erro ao atualizar história:',
        updateError
      );

      if (
        uploadedFilePath
      ) {
        await supabase.storage
          .from(
            'story-covers'
          )
          .remove([
            uploadedFilePath,
          ]);
      }

      return NextResponse.json(
        {
          error:
            'Não foi possível atualizar a história.',
        },
        {
          status: 500,
        }
      );
    }

    /*
     * ==================================================
     * ORGANIZA TAGS
     * ==================================================
     */

    let finalTags =
      tagsText
        .split(',')
        .map(
          (tag) =>
            tag.trim()
        )
        .filter(Boolean);

    const uniqueTags:
      string[] = [];

    for (
      const tag of finalTags
    ) {
      const normalized =
        tag.toLowerCase();

      if (
        !uniqueTags.some(
          (existing) =>
            existing.toLowerCase() ===
            normalized
        )
      ) {
        uniqueTags.push(
          tag
        );
      }
    }

    finalTags =
      uniqueTags.slice(
        0,
        30
      );

    /*
     * ==================================================
     * REMOVE TAGS ANTIGAS
     * ==================================================
     */

    const {
      error:
        deleteTagsError,
    } = await supabase
      .from('story_tags')
      .delete()
      .eq(
        'story_id',
        id
      );

    if (deleteTagsError) {
      console.error(
        'Erro ao remover tags antigas:',
        deleteTagsError
      );

      return NextResponse.json(
        {
          error:
            'A história foi atualizada, mas houve um erro ao atualizar as tags.',
        },
        {
          status: 500,
        }
      );
    }

    /*
     * ==================================================
     * PREPARA TAGS
     * ==================================================
     */

    const tagsToInsert:
      string[] = [];

    if (genre) {
      tagsToInsert.push(
        genre
      );
    }

    for (
      const tag of finalTags
    ) {
      if (
        !tagsToInsert.some(
          (existing) =>
            existing.toLowerCase() ===
            tag.toLowerCase()
        )
      ) {
        tagsToInsert.push(
          tag
        );
      }
    }

    /*
     * ==================================================
     * CATEGORIAS
     * ==================================================
     */

    const {
      data: categories,
      error:
        categoriesError,
    } = await supabase
      .from(
        'tag_categories'
      )
      .select(
        'id, slug'
      );

    if (categoriesError) {
      console.error(
        'Erro ao buscar categorias:',
        categoriesError
      );

      return NextResponse.json(
        {
          error:
            'História atualizada, mas não foi possível atualizar as tags.',
        },
        {
          status: 500,
        }
      );
    }

    const categoryMap =
      new Map(
        (
          categories ||
          []
        ).map(
          (category) => [
            category.slug,
            category.id,
          ]
        )
      );

    /*
     * ==================================================
     * CRIA / RECUPERA TAGS
     * ==================================================
     */

    const tagIds:
      string[] = [];

    for (
      const tagName of tagsToInsert
    ) {
      const slug =
        createSlug(
          tagName
        );

      if (!slug) {
        continue;
      }

      let {
        data:
          existingTag,
      } =
        await supabase
          .from('tags')
          .select(
            'id, category_id'
          )
          .eq(
            'slug',
            slug
          )
          .maybeSingle();

      if (!existingTag) {
        const isGenre =
          genre &&
          tagName.toLowerCase() ===
            genre.toLowerCase();

        const categoryId =
          isGenre
            ? categoryMap.get(
                'genre'
              ) ||
              null
            : categoryMap.get(
                'freeform'
              ) ||
              null;

        const {
          data: newTag,
          error:
            createTagError,
        } =
          await supabase
            .from('tags')
            .insert({
              name:
                tagName,

              slug:
                slug,

              category_id:
                categoryId,

              created_by:
                userId,
            })
            .select(
              'id, category_id'
            )
            .single();

        if (
          createTagError
        ) {
          const {
            data:
              retryTag,
          } =
            await supabase
              .from('tags')
              .select(
                'id, category_id'
              )
              .eq(
                'slug',
                slug
              )
              .maybeSingle();

          if (!retryTag) {
            console.error(
              'Erro ao criar tag:',
              createTagError
            );

            continue;
          }

          existingTag =
            retryTag;
        } else {
          existingTag =
            newTag;
        }
      }

      if (
        existingTag?.id
      ) {
        tagIds.push(
          existingTag.id
        );
      }
    }

    /*
     * ==================================================
     * RELACIONA TAGS À HISTÓRIA
     * ==================================================
     */

    if (
      tagIds.length >
      0
    ) {
      const rows =
        [
          ...new Set(
            tagIds
          ),
        ].map(
          (tagId) => ({
            story_id:
              id,

            tag_id:
              tagId,
          })
        );

      const {
        error:
          insertTagsError,
      } =
        await supabase
          .from(
            'story_tags'
          )
          .insert(
            rows
          );

      if (
        insertTagsError
      ) {
        console.error(
          'Erro ao relacionar tags:',
          insertTagsError
        );

        return NextResponse.json(
          {
            error:
              'História atualizada, mas houve um erro ao salvar as tags.',
          },
          {
            status: 500,
          }
        );
      }
    }

    /*
     * ==================================================
     * RETORNO
     * ==================================================
     */

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
          'Erro interno do servidor.',
      },
      {
        status: 500,
      }
    );
  }
}
