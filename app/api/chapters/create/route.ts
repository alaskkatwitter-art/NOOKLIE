import { spotifyUpdate } from '@/lib/spotify/resolve';
import {safeChapterHtml} from '@/lib/security/html';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;

const supabase = createClient(
  supabaseUrl,
  process.env.SUPABASE_SECRET_KEY!
);

const MAX_TITLE_LENGTH = 150;
const MAX_BODY_LENGTH = 500000;

type PublicationStatus =
  | 'draft'
  | 'scheduled'
  | 'published'
  | 'unpublished';

function noCacheHeaders() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  };
}

async function getAuthenticatedUser(request: Request) {
  const cookie = request.headers.get('cookie') || '';

  const sessionMatch = cookie.match(
    /(?:^|;\s*)toriland_session=([^;]+)/
  );

  if (!sessionMatch) {
    return null;
  }

  const sessionToken = sessionMatch[1];

  const tokenHash = crypto
    .createHash('sha256')
    .update(sessionToken)
    .digest('hex');

  const { data: session, error } = await supabase
    .from('auth_sessions')
    .select('id, user_id, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) {
    console.error(
      'Erro ao verificar sessão:',
      error
    );

    throw new Error(
      'Não foi possível verificar sua sessão.'
    );
  }

  if (!session) {
    return null;
  }

  if (
    session.expires_at &&
    new Date(session.expires_at) < new Date()
  ) {
    return null;
  }

  return session.user_id;
}

function normalizePublicationStatus(
  value: unknown,
  scheduledFor: Date | null
): PublicationStatus {
  if (
    value === 'draft' ||
    value === 'scheduled' ||
    value === 'published' ||
    value === 'unpublished'
  ) {
    return value;
  }

  if (scheduledFor) {
    return 'scheduled';
  }

  return 'published';
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUser(request);

    if (!userId) {
      return NextResponse.json(
        {
          error: 'Você precisa estar logado.',
        },
        {
          status: 401,
          headers: noCacheHeaders(),
        }
      );
    }

    let data: Record<string, unknown>;

    try {
      data = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: 'Dados inválidos.',
        },
        {
          status: 400,
          headers: noCacheHeaders(),
        }
      );
    }

    const storyId =
      typeof data.story_id === 'string'
        ? data.story_id.trim()
        : '';

    const title =
      typeof data.title === 'string'
        ? data.title.trim()
        : '';

    const chapterBody =
      typeof data.body === 'string'
        ? data.body.trim()
        : '';

    const authorNotes =
      typeof data.author_notes === 'string'
        ? data.author_notes.trim()
        : '';

    const scheduledForRaw =
      typeof data.scheduled_for === 'string'
        ? data.scheduled_for.trim()
        : '';

    const scheduledDate = scheduledForRaw
      ? new Date(scheduledForRaw)
      : null;

    if (!storyId) {
      return NextResponse.json(
        {
          error: 'História não encontrada.',
        },
        {
          status: 400,
          headers: noCacheHeaders(),
        }
      );
    }

    if (!title) {
      return NextResponse.json(
        {
          error:
            'Digite um título para o capítulo.',
        },
        {
          status: 400,
          headers: noCacheHeaders(),
        }
      );
    }

    if (title.length > MAX_TITLE_LENGTH) {
      return NextResponse.json(
        {
          error:
            'O título pode ter no máximo 150 caracteres.',
        },
        {
          status: 400,
          headers: noCacheHeaders(),
        }
      );
    }

    if (!chapterBody) {
      return NextResponse.json(
        {
          error:
            'Escreva o conteúdo do capítulo.',
        },
        {
          status: 400,
          headers: noCacheHeaders(),
        }
      );
    }

    if (chapterBody.length > MAX_BODY_LENGTH) {
      return NextResponse.json(
        {
          error:
            'O conteúdo do capítulo é muito grande.',
        },
        {
          status: 400,
          headers: noCacheHeaders(),
        }
      );
    }

    if (authorNotes.length > 5000) {
      return NextResponse.json(
        {
          error:
            'As notas do autor podem ter no máximo 5000 caracteres.',
        },
        {
          status: 400,
          headers: noCacheHeaders(),
        }
      );
    }

    /*
     * Valida a data de agendamento antes de
     * criar qualquer registro.
     */
    if (scheduledForRaw) {
      if (
        !scheduledDate ||
        Number.isNaN(scheduledDate.getTime())
      ) {
        return NextResponse.json(
          {
            error:
              'A data de publicação escolhida é inválida.',
          },
          {
            status: 400,
            headers: noCacheHeaders(),
          }
        );
      }

      if (scheduledDate <= new Date()) {
        return NextResponse.json(
          {
            error:
              'A data de publicação precisa estar no futuro.',
          },
          {
            status: 400,
            headers: noCacheHeaders(),
          }
        );
      }
    }

    /*
     * Verifica se a história existe
     * e pertence ao usuário logado.
     */
    const { data: story, error: storyError } =
      await supabase
        .from('stories')
        .select('id, author_id')
        .eq('id', storyId)
        .maybeSingle();

    if (storyError) {
      console.error(
        'Erro ao buscar história:',
        storyError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível verificar a história.',
        },
        {
          status: 500,
          headers: noCacheHeaders(),
        }
      );
    }

    if (!story) {
      return NextResponse.json(
        {
          error: 'História não encontrada.',
        },
        {
          status: 404,
          headers: noCacheHeaders(),
        }
      );
    }

    if (story.author_id !== userId) {
      return NextResponse.json(
        {
          error:
            'Você não pode adicionar capítulos a esta história.',
        },
        {
          status: 403,
          headers: noCacheHeaders(),
        }
      );
    }

    /*
     * Descobre o próximo número do capítulo.
     */
    const {
      data: lastChapter,
      error: lastChapterError,
    } = await supabase
      .from('chapters')
      .select('chapter_number')
      .eq('story_id', storyId)
      .order('chapter_number', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (lastChapterError) {
      console.error(
        'Erro ao buscar último capítulo:',
        lastChapterError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível verificar os capítulos.',
        },
        {
          status: 500,
          headers: noCacheHeaders(),
        }
      );
    }

    const chapterNumber = lastChapter
      ? Number(lastChapter.chapter_number) + 1
      : 1;

    /*
     * Determina o estado inicial.
     *
     * Se houver uma data futura:
     * scheduled
     *
     * Caso contrário:
     * published
     */
    const publicationStatus =
      normalizePublicationStatus(
        data.publication_status,
        scheduledDate
      );

    /*
     * Um capítulo agendado não pode ser
     * marcado como publicado imediatamente.
     */
    const isScheduled =
      publicationStatus === 'scheduled';

    const isPublished =
      publicationStatus === 'published';

    /*
     * Para o primeiro lançamento, a data
     * original de publicação é registrada
     * somente quando ele realmente é publicado.
     */
    const originalPublishedAt = isPublished
      ? new Date().toISOString()
      : null;

    const music = await spotifyUpdate(data.spotify_url);
    if (music instanceof NextResponse) return music;

    /*
     * Cria o capítulo.
     */
    const {
      data: chapter,
      error: chapterError,
    } = await supabase
      .from('chapters')
      .insert({
        ...music,
        story_id: storyId,
        chapter_number: chapterNumber,
        title,
        body: safeChapterHtml(chapterBody),
        published: isPublished,
        publication_status: publicationStatus,
        author_notes: authorNotes || null,
        original_published_at:
          originalPublishedAt,
        republished_at: null,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (chapterError) {
      console.error(
        'Erro ao criar capítulo:',
        chapterError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível criar o capítulo.',
        },
        {
          status: 500,
          headers: noCacheHeaders(),
        }
      );
    }

    /*
     * Se o capítulo foi agendado,
     * cria o registro em scheduled_chapters.
     */
    if (
      isScheduled &&
      scheduledDate
    ) {
      const {
        error: scheduleError,
      } = await supabase
        .from('scheduled_chapters')
        .insert({
          chapter_id: chapter.id,
          scheduled_for:
            scheduledDate.toISOString(),
        });

      if (scheduleError) {
        console.error(
          'Erro ao criar agendamento:',
          scheduleError
        );

        /*
         * Rollback manual:
         * se o agendamento falhar,
         * não deixamos o capítulo órfão.
         */
        await supabase
          .from('chapters')
          .delete()
          .eq('id', chapter.id);

        return NextResponse.json(
          {
            error:
              'Não foi possível agendar o capítulo.',
          },
          {
            status: 500,
            headers: noCacheHeaders(),
          }
        );
      }
    }

    /*
     * Se não for agendado, garante que não
     * exista nenhum agendamento relacionado.
     */
    if (!isScheduled) {
      await supabase
        .from('scheduled_chapters')
        .delete()
        .eq('chapter_id', chapter.id);
    }

    return NextResponse.json(
      {
        success: true,

        chapter,

        scheduled: isScheduled,

        published: isPublished,

        publication_status:
          publicationStatus,

        scheduled_for:
          scheduledDate?.toISOString() || null,

        original_published_at:
          originalPublishedAt,

        republished_at: null,
      },
      {
        status: 201,
        headers: noCacheHeaders(),
      }
    );
  } catch (error) {
    console.error(
      'Erro inesperado ao criar capítulo:',
      error
    );

    return NextResponse.json(
      {
        error: 'Não foi possível criar o capítulo.',
      },
      {
        status: 500,
        headers: noCacheHeaders(),
      }
    );
  }
}
