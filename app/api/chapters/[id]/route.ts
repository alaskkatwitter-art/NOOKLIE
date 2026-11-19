import { getMediaBucket } from '@/lib/media/r2-binding';
import { getSessionTokenHash } from '@/lib/auth/session';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1Books } from '@/lib/database/d1-books';
import { mediaStorage } from '@/lib/media/storage';
import { spotifyUpdate } from '@/lib/spotify/resolve';
import { imageMatchesType } from '@/lib/security/uploads';
import { chapterKinds } from '@/lib/stories/metadata';
import {chatActor} from '@/lib/chat/server';
import {safeChapterHtml} from '@/lib/security/html';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { isPublicStoryVisible } from '@/lib/moderation/content-visibility';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_MEDIA_PER_CHAPTER = 25;

const ALLOWED_MEDIA_TYPES: Record<string, 'image' | 'gif'> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'gif',
};

function noCacheHeaders() {
  return {
    'Cache-Control':
      'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  };
}

async function getAuthenticatedUser(request: Request) {
  const cookieHeader = request.headers.get('cookie') || '';

  const match = cookieHeader.match(
    /(?:^|;\s*)toriland_session=([^;]+)/
  );

  if (!match?.[1]) {
    return null;
  }

  const sessionToken = decodeURIComponent(match[1]);

  const tokenHash = crypto
    .createHash('sha256')
    .update(sessionToken)
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
    new Date(session.expires_at).getTime() <= Date.now()
  ) {
    return null;
  }

  return session.user_id as string;
}

function cleanHtml(value:unknown){return typeof value==='string'?safeChapterHtml(value).trim():'';}

function normalizePublicationStatus(
  value: unknown
): 'draft' | 'scheduled' | 'published' | 'unpublished' {
  if (
    value === 'draft' ||
    value === 'scheduled' ||
    value === 'published' ||
    value === 'unpublished'
  ) {
    return value;
  }

  return 'draft';
}

function getCurrentPublicationStatus(
  chapter: {
    publication_status?: string | null;
    published?: boolean | null;
  }
):
  | 'draft'
  | 'scheduled'
  | 'published'
  | 'unpublished' {
  if (
    chapter.publication_status === 'draft' ||
    chapter.publication_status === 'scheduled' ||
    chapter.publication_status === 'published' ||
    chapter.publication_status === 'unpublished'
  ) {
    return chapter.publication_status;
  }

  if (chapter.published === true) {
    return 'published';
  }

  return 'draft';
}

function isFutureDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return false;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return false;
  }

  return date.getTime() > Date.now();
}

function extensionFromMime(mime: string) {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';

    case 'image/png':
      return 'png';

    case 'image/webp':
      return 'webp';

    case 'image/gif':
      return 'gif';

    default:
      return 'bin';
  }
}

/*
 * GET
 *
 * Carrega um capítulo.
 */
export async function GET(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await context.params;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        {
          error: 'Capítulo não encontrado.',
        },
        {
          status: 404,
          headers: noCacheHeaders(),
        }
      );
    }

    const d1 = getD1PreviewDatabase('auth');
    if (d1) {
      const result = await d1Books(d1, safeChapterHtml).chapterForReader(await getSessionTokenHash(), id);
      return result
        ? NextResponse.json(result, { headers: noCacheHeaders() })
        : NextResponse.json({ error: 'Capítulo não encontrado.' }, { status: 404, headers: noCacheHeaders() });
    }

    const { data: chapter, error: chapterError } =
      await supabase
        .from('chapters')
        .select(`
          id,
          story_id,
          chapter_number,
          entry_kind,
          title,
          body,
          published,
          created_at,
          author_notes,
          spotify_link,
          original_published_at,
          republished_at,
          updated_at,
          publication_status,
          banner_url
        `)
        .eq('id', id)
        .maybeSingle();

    if (chapterError) {
      console.error(
        'Erro ao buscar capítulo:',
        chapterError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível carregar o capítulo.',
        },
        {
          status: 500,
          headers: noCacheHeaders(),
        }
      );
    }

    if (!chapter) {
      return NextResponse.json(
        {
          error: 'Capítulo não encontrado.',
        },
        {
          status: 404,
          headers: noCacheHeaders(),
        }
      );
    }

    const actor = await chatActor();
    const owner = actor && await supabase.from('stories').select('id').eq('id', chapter.story_id)
      .eq('author_id', actor.profileId).maybeSingle();
    if (owner && owner.error) throw owner.error;
    if (!owner?.data && (!chapter.published || !(await isPublicStoryVisible(supabase, chapter.story_id)))) {
      return NextResponse.json({ error: 'Capítulo não encontrado.' }, { status: 404, headers: noCacheHeaders() });
    }

    const { data: media, error: mediaError } =
      await supabase
        .from('chapter_media')
        .select(`
          id,
          chapter_id,
          media_url,
          media_type,
          position,
          created_at
        `)
        .eq('chapter_id', id)
        .order('position', {
          ascending: true,
        });

    if (mediaError) {
      console.error(
        'Erro ao buscar mídias do capítulo:',
        mediaError
      );
    }

    const {
      data: previousChapter,
      error: previousError,
    } = await supabase
      .from('chapters')
      .select(
        'id, story_id, chapter_number, title, published'
      )
      .eq('story_id', chapter.story_id)
      .eq('published', true)
      .lt(
        'chapter_number',
        chapter.chapter_number
      )
      .order('chapter_number', {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

    if (previousError) {
      console.error(
        'Erro ao buscar capítulo anterior:',
        previousError
      );
    }

    const {
      data: nextChapter,
      error: nextError,
    } = await supabase
      .from('chapters')
      .select(
        'id, story_id, chapter_number, title, published'
      )
      .eq('story_id', chapter.story_id)
      .eq('published', true)
      .gt(
        'chapter_number',
        chapter.chapter_number
      )
      .order('chapter_number', {
        ascending: true,
      })
      .limit(1)
      .maybeSingle();

    if (nextError) {
      console.error(
        'Erro ao buscar próximo capítulo:',
        nextError
      );
    }

    const schedule=await supabase.from('scheduled_chapters').select('scheduled_for').eq('chapter_id',id).maybeSingle();
    if(schedule.error)throw schedule.error;
    return NextResponse.json(
      {
        chapter:{...chapter,body:safeChapterHtml(chapter.body||'')},
        scheduled_for: schedule.data?.scheduled_for||null,
        media: media || [],
        previousChapter:
          previousChapter || null,
        nextChapter:
          nextChapter || null,
      },
      {
        status: 200,
        headers: noCacheHeaders(),
      }
    );
  } catch (error) {
    console.error(
      'Erro inesperado ao carregar capítulo:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Não foi possível carregar o capítulo.',
      },
      {
        status: 500,
        headers: noCacheHeaders(),
      }
    );
  }
}

/*
 * PUT
 *
 * Edita um capítulo pertencente ao usuário autenticado.
 *
 * Aceita:
 *
 * title
 * body
 * author_notes
 * publication_status
 * scheduled_for
 * media
 *
 * publication_status:
 *
 * draft
 * scheduled
 * published
 * unpublished
 */
export async function PUT(
  request: Request,
  context: {
    params: Promise<{ id: string }>;
  }
) {
  try {
    const { id } = await context.params;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        {
          error: 'Capítulo não encontrado.',
        },
        {
          status: 404,
          headers: noCacheHeaders(),
        }
      );
    }

    const d1 = getD1PreviewDatabase('auth');
    const hash = d1 ? await getSessionTokenHash() : null;
    const actor = d1 && hash ? await d1.prepare('SELECT profile_id FROM d1_social_actors WHERE token_hash=?')
      .bind(hash).first<{ profile_id: string }>() : null;
    const userId = d1 ? actor?.profile_id : await getAuthenticatedUser(request);

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

    /*
     * Busca o capítulo atual ANTES da edição.
     *
     * Isso é importante porque usamos o status atual
     * como fallback caso o frontend não envie
     * publication_status.
     */
    const {
      data: chapter,
      error: chapterError,
    } = d1 ? { data: await d1.prepare('SELECT * FROM chapters WHERE id=?').bind(id).first<{
        id: string; story_id: string; title: string; body: string; author_notes: string | null;
        published: number | null; publication_status: string; spotify_link: string | null;
        original_published_at: string | null; republished_at: string | null;
      }>().then(row => row && { ...row, published: row.published === null ? null : Boolean(row.published) }), error: null }
      : await supabase
      .from('chapters')
      .select(`
        id,
        story_id,
        chapter_number,
          entry_kind,
        title,
        body,
        published,
        created_at,
        author_notes,
        spotify_link,
        original_published_at,
        republished_at,
        updated_at,
        publication_status,
        banner_url
      `)
      .eq('id', id)
      .maybeSingle();

    if (chapterError) {
      console.error(
        'Erro ao encontrar capítulo para edição:',
        chapterError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível encontrar o capítulo.',
        },
        {
          status: 500,
          headers: noCacheHeaders(),
        }
      );
    }

    if (!chapter) {
      return NextResponse.json(
        {
          error: 'Capítulo não encontrado.',
        },
        {
          status: 404,
          headers: noCacheHeaders(),
        }
      );
    }

    /*
     * Confirma que o capítulo pertence a uma obra
     * do usuário autenticado.
     */
    const {
      data: story,
      error: storyError,
    } = d1 ? { data: await d1.prepare('SELECT author_id FROM stories WHERE id=? AND moderation_hidden_at IS NULL').bind(chapter.story_id).first<{ author_id: string }>(), error: null }
      : await supabase
      .from('stories')
      .select('id, author_id')
      .eq('id', chapter.story_id)
      .maybeSingle();

    if (storyError) {
      console.error(
        'Erro ao verificar autoria:',
        storyError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível verificar a autoria.',
        },
        {
          status: 500,
          headers: noCacheHeaders(),
        }
      );
    }

    if (
      !story ||
      story.author_id !== userId
    ) {
      return NextResponse.json(
        {
          error:
            'Você não tem permissão para editar este capítulo.',
        },
        {
          status: 403,
          headers: noCacheHeaders(),
        }
      );
    }

    const formData =
      await request.formData();

    const music = await spotifyUpdate(formData.get('spotify_url') ?? undefined, d1 && typeof chapter.spotify_link === 'string' ? JSON.parse(chapter.spotify_link) : chapter.spotify_link);
    if (music instanceof NextResponse) return music;

    const entryKind = formData.get('entry_kind');
    if (entryKind !== null && (typeof entryKind !== 'string' || !Object.hasOwn(chapterKinds, entryKind))) {
      return NextResponse.json({ error: 'Tipo de capítulo inválido.' }, { status: 400 });
    }

    const titleValue =
      formData.get('title');

    const bodyValue =
      formData.get('body');

    const notesValue =
      formData.get('author_notes');

    const statusValue =
      formData.get(
        'publication_status'
      );

    const scheduledForValue =
      formData.get(
        'scheduled_for'
      );

    const title =
      typeof titleValue === 'string'
        ? titleValue.trim()
        : chapter.title || '';

    const body =
      typeof bodyValue === 'string'
        ? cleanHtml(bodyValue)
        : chapter.body || '';

    const authorNotes =
      typeof notesValue === 'string'
        ? notesValue.trim()
        : chapter.author_notes || '';

    /*
     * ========================================================
     * CORREÇÃO PRINCIPAL
     * ========================================================
     *
     * Antes:
     *
     * normalizePublicationStatus(null)
     *      ↓
     * draft
     *
     * Isso fazia um capítulo publicado virar
     * rascunho quando o frontend não enviava
     * publication_status.
     *
     * Agora:
     *
     * - se o frontend enviar um status válido,
     *   usamos o status enviado;
     *
     * - se NÃO enviar status,
     *   preservamos o status atual do capítulo.
     */
    const statusWasProvided =
      typeof statusValue === 'string' &&
      statusValue.trim().length > 0;

    const publicationStatus =
      statusWasProvided
        ? normalizePublicationStatus(
            statusValue
          )
        : getCurrentPublicationStatus(
            chapter
          );

    /*
     * Também verificamos se o frontend enviou
     * scheduled_for.
     */
    const scheduledForWasProvided =
      typeof scheduledForValue === 'string' &&
      scheduledForValue.trim().length > 0;

    if (!title) {
      return NextResponse.json(
        {
          error:
            'O capítulo precisa ter um título.',
        },
        {
          status: 400,
          headers: noCacheHeaders(),
        }
      );
    }

    if (title.length > 150) {
      return NextResponse.json(
        {
          error:
            'O título do capítulo pode ter no máximo 150 caracteres.',
        },
        {
          status: 400,
          headers: noCacheHeaders(),
        }
      );
    }

    if (!body) {
      return NextResponse.json(
        {
          error:
            'O capítulo não pode estar vazio.',
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
            'As notas do autor podem ter no máximo 5.000 caracteres.',
        },
        {
          status: 400,
          headers: noCacheHeaders(),
        }
      );
    }

    /*
     * ========================================================
     * AGENDAMENTO
     * ========================================================
     */

    let scheduledDate: Date | null =
      null;

    if (
      publicationStatus === 'scheduled'
    ) {
      if (
        typeof scheduledForValue !==
          'string' ||
        !scheduledForValue.trim()
      ) {
        return NextResponse.json(
          {
            error:
              'Informe a data e o horário de publicação.',
          },
          {
            status: 400,
            headers: noCacheHeaders(),
          }
        );
      }

      if (
        !isFutureDate(
          scheduledForValue
        )
      ) {
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

      scheduledDate =
        new Date(
          scheduledForValue
        );
    }

    if (d1 && hash) {
      const headers = noCacheHeaders();
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers });
      const captured = await d1.prepare('SELECT * FROM chapter_media WHERE chapter_id=? ORDER BY position,id').bind(id).all<{ id: string }>();
      if (!captured.success) throw Error('Unable to load chapter media');
      const retained = formData.getAll('existing_media_ids');
      const files = formData.getAll('media').filter((item): item is File => item instanceof File && item.size > 0);
      const replaceMedia = formData.get('replace_media') === '1' || retained.length > 0 || files.length > 0;
      const ids = replaceMedia ? retained : captured.results.map(item => item.id);
      if (new Set(ids).size !== ids.length || ids.some(item => typeof item !== 'string' || !captured.results.some(media => media.id === item)) ||
          ids.length + files.length > MAX_MEDIA_PER_CHAPTER) {
        return NextResponse.json({ error: 'Seleção de mídias inválida.' }, { status: 400, headers });
      }
      const uploads: { id: string; key: string; url: string; type: string; mime: string; bytes: ArrayBuffer }[] = [];
      for (const file of files) {
        const type = ALLOWED_MEDIA_TYPES[file.type];
        if (!type || file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'Imagem inválida ou acima de 5 MB.' }, { status: 400, headers });
        const bytes = await file.arrayBuffer();
        if (!imageMatchesType(new Uint8Array(bytes), file.type)) return NextResponse.json({ error: 'Formato da imagem inválido.' }, { status: 400, headers });
        const mediaId = crypto.randomUUID();
        const key = `d1-chapters/${mediaId}.${extensionFromMime(file.type)}`;
        const url = '/api/content-media?' + new URLSearchParams({ bucket: 'chapter-media', path: key });
        uploads.push({ id: mediaId, key, url, type, mime: file.type, bytes });
      }
      const schedule = scheduledDate?.toISOString() ?? null;
      const musicJson = music.spotify_link === undefined ? null : JSON.stringify(music.spotify_link);
      const update = d1.prepare(`UPDATE chapters SET title=?3,body=?4,author_notes=?5,
        entry_kind=coalesce(?6,entry_kind), spotify_link=CASE WHEN ?7 IS NULL THEN spotify_link ELSE nullif(?7,'null') END,
        published=?8='published', publication_status=?8,
        original_published_at=CASE WHEN ?8='published' THEN coalesce(original_published_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) ELSE original_published_at END,
        republished_at=CASE WHEN ?8='published' AND coalesce(published,0)=0 AND original_published_at IS NOT NULL
          THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE republished_at END,
        updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=?2 AND EXISTS(SELECT 1 FROM stories s JOIN d1_social_actors a ON a.profile_id=s.author_id
          WHERE a.token_hash=?1 AND s.id=chapters.story_id AND s.moderation_hidden_at IS NULL)`)
        .bind(hash,id,title,body,authorNotes || null,typeof entryKind === 'string' ? entryKind : null,musicJson,publicationStatus);
      const setSchedule = d1.prepare(`INSERT INTO scheduled_chapters(id,chapter_id,scheduled_for)
        SELECT id,id,?2 FROM chapters WHERE id=?1 AND publication_status='scheduled' AND ?2 IS NOT NULL AND changes()=1
        ON CONFLICT(chapter_id) DO UPDATE SET scheduled_for=excluded.scheduled_for,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`)
        .bind(id,schedule);
      const statements = [update, setSchedule];
      const owner = `EXISTS(SELECT 1 FROM chapters c JOIN stories s ON s.id=c.story_id
        JOIN d1_social_actors a ON a.profile_id=s.author_id
        WHERE c.id=?1 AND a.token_hash=?2 AND s.moderation_hidden_at IS NULL)`;
      if (replaceMedia) {
        statements.push(d1.prepare(`DELETE FROM chapter_media WHERE chapter_id=?1 AND ${owner}
          AND id NOT IN (SELECT value FROM json_each(?3))`).bind(id,hash,JSON.stringify(ids)));
        ids.forEach((mediaId,position) => statements.push(d1.prepare(`UPDATE chapter_media SET position=?4
          WHERE chapter_id=?1 AND id=?3 AND ${owner}`).bind(id,hash,String(mediaId),position)));
        uploads.forEach((item,index) => statements.push(d1.prepare(`INSERT INTO chapter_media(id,chapter_id,media_url,media_type,position)
          SELECT ?3,?1,?4,?5,?6 WHERE ${owner}`).bind(id,hash,item.id,item.url,item.type,ids.length+index)));
      }
      const bucket = uploads.length ? getMediaBucket() : undefined;
      if (uploads.length && !bucket) throw Error('Preview media bucket unavailable');
      const stored: string[] = [];
      let committed = false;
      try {
        for (const item of uploads) {
          const key = 'chapter-media/' + item.key;
          const written = await bucket!.put(key,item.bytes,{ onlyIf:{ etagDoesNotMatch:'*' },httpMetadata:{contentType:item.mime} });
          if (!written) throw Error('Unable to store chapter media');
          stored.push(key);
        }
        const result = await d1.batch(statements);
        if (result.some(row => !row.success)) throw Error('Unable to edit chapter');
        if (!result[0].meta.changes) return NextResponse.json({ error: 'Capítulo indisponível.' }, { status: 409, headers });
        committed = true;
      } finally {
        if (!committed && stored.length) await bucket?.delete(stored).catch(() => undefined);
      }
      const edited = await d1Books(d1,safeChapterHtml).chapterForReader(hash,id);
      return NextResponse.json({
        success: true, chapter: edited?.chapter, media: edited?.media ?? captured.results,
        scheduled: publicationStatus === 'scheduled', scheduled_for: schedule,
        publication_status: publicationStatus, published: publicationStatus === 'published',
        status_was_provided: statusWasProvided, scheduled_for_was_provided: scheduledForWasProvided,
      }, { headers });
    }

    /*
     * Se não foi enviado status, preservamos
     * o estado atual.
     *
     * Portanto:
     *
     * published → continua published
     * draft → continua draft
     * scheduled → continua scheduled
     * unpublished → continua unpublished
     */
    const wasPreviouslyPublished =
      Boolean(
        chapter.original_published_at
      ) ||
      chapter.publication_status ===
        'published' ||
      chapter.published === true;

    const isNowPublished =
      publicationStatus ===
      'published';

    let originalPublishedAt =
      chapter.original_published_at ||
      null;

    let republishedAt =
      chapter.republished_at || null;

    /*
     * Primeira publicação:
     * preservamos a primeira data para sempre.
     */
    if (
      isNowPublished &&
      !originalPublishedAt
    ) {
      originalPublishedAt =
        new Date().toISOString();
    }

    /*
     * Se já tinha sido publicado anteriormente,
     * qualquer nova publicação recebe uma data
     * de republicação.
     */
    if (
      isNowPublished &&
      wasPreviouslyPublished &&
      chapter.publication_status !==
        'published'
    ) {
      republishedAt =
        new Date().toISOString();
    }

    /*
     * Só será false quando o status escolhido
     * realmente for diferente de published.
     */
    const published =
      publicationStatus ===
      'published';

    /*
     * ========================================================
     * ATUALIZA O CAPÍTULO
     * ========================================================
     */
    const {
      data: updatedChapter,
      error: updateError,
    } = await supabase
      .from('chapters')
      .update({
        ...music,
        ...(entryKind !== null ? { entry_kind: entryKind } : {}),
        title,
        body,
        author_notes:
          authorNotes || null,
        published: chapter.published,
        publication_status: chapter.publication_status,
        original_published_at: chapter.original_published_at,
        republished_at: chapter.republished_at,
        updated_at:
          new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        id,
        story_id,
        chapter_number,
          entry_kind,
        title,
        body,
        published,
        created_at,
        author_notes,
        original_published_at,
        republished_at,
        updated_at,
        publication_status,
        banner_url
      `)
      .single();

    if (updateError) {
      console.error(
        'Erro ao atualizar capítulo:',
        updateError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível salvar as alterações.',
        },
        {
          status: 500,
          headers: noCacheHeaders(),
        }
      );
    }

    /*
     * ========================================================
     * AGENDAMENTO
     * ========================================================
     *
     * Usamos a tabela scheduled_chapters
     * que já existe.
     */

    /*
     * ========================================================
     * NOVAS MÍDIAS
     * ========================================================
     */

    const mediaFiles =
      formData
        .getAll('media')
        .filter(
          (
            item
          ): item is File =>
            item instanceof File &&
            item.size > 0
        );

    /*
     * ========================================================
     * MÍDIAS EXISTENTES
     * ========================================================
     */

    const existingMediaIds =
      formData
        .getAll(
          'existing_media_ids'
        )
        .filter(
          (
            item
          ): item is string =>
            typeof item ===
              'string' &&
            item.trim()
              .length > 0
        );

    /*
     * Busca todas as mídias atuais.
     */
    const {
      data: currentMedia,
      error: currentMediaError,
    } = await supabase
      .from('chapter_media')
      .select(
        'id, media_url, media_type, position'
      )
      .eq(
        'chapter_id',
        id
      )
      .order('position', {
        ascending: true,
      });

    if (currentMediaError) {
      console.error(
        'Erro ao buscar mídias existentes:',
        currentMediaError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível verificar as mídias do capítulo.',
        },
        {
          status: 500,
          headers: noCacheHeaders(),
        }
      );
    }

    const currentMediaList =
      currentMedia || [];

    /*
     * IDs existentes que continuarão no capítulo.
     */
    const keptExistingMedia =
      currentMediaList.filter(
        (item) =>
          existingMediaIds.includes(
            item.id
          )
      );

    const totalMedia =
      keptExistingMedia.length +
      mediaFiles.length;

    if (
      totalMedia >
      MAX_MEDIA_PER_CHAPTER
    ) {
      return NextResponse.json(
        {
          error:
            'Um capítulo pode ter no máximo ' +
            MAX_MEDIA_PER_CHAPTER +
            ' imagens ou GIFs.',
        },
        {
          status: 400,
          headers: noCacheHeaders(),
        }
      );
    }

    /*
     * ========================================================
     * VALIDAÇÃO DOS ARQUIVOS
     * ========================================================
     */

    for (
      const file of mediaFiles
    ) {
      if (!imageMatchesType(new Uint8Array(await file.arrayBuffer()), file.type)) {
        return NextResponse.json({ error: 'O conteúdo do arquivo não corresponde ao formato da imagem.' }, { status: 415 });
      }

      if (
        file.size >
        MAX_FILE_SIZE
      ) {
        return NextResponse.json(
          {
            error:
              'O arquivo "' +
              file.name +
              '" ultrapassa o limite de 5 MB.',
          },
          {
            status: 400,
            headers:
              noCacheHeaders(),
          }
        );
      }

      if (
        !ALLOWED_MEDIA_TYPES[
          file.type
        ]
      ) {
        return NextResponse.json(
          {
            error:
              'O arquivo "' +
              file.name +
              '" possui um formato não permitido. Use JPG, PNG, WEBP ou GIF.',
          },
          {
            status: 400,
            headers:
              noCacheHeaders(),
          }
        );
      }
    }

    /*
     * ========================================================
     * REMOVE MÍDIAS EXCLUÍDAS
     * ========================================================
     */

    const mediaToDelete =
      currentMediaList.filter(
        (item) =>
          !existingMediaIds.includes(
            item.id
          )
      );

    for (
      const media of mediaToDelete
    ) {
      try {
        const publicUrl =
          media.media_url;

        const marker =
          '/storage/v1/object/public/chapter-media/';

        const markerIndex =
          publicUrl.indexOf(
            marker
          );

        if (
          markerIndex !== -1
        ) {
          const storagePath =
            publicUrl.substring(
              markerIndex +
                marker.length
            );

          const {
            error: removeError,
          } =
            await mediaStorage(supabase, 'chapter-media')
              .remove([
                storagePath,
              ]);

          if (removeError) {
            console.error(
              'Erro ao remover arquivo do Storage:',
              removeError
            );
          }
        }
      } catch (
        storageError
      ) {
        console.error(
          'Erro ao processar remoção de mídia:',
          storageError
        );
      }

      const {
        error:
          deleteMediaError,
      } = await supabase
        .from('chapter_media')
        .delete()
        .eq(
          'id',
          media.id
        );

      if (
        deleteMediaError
      ) {
        console.error(
          'Erro ao remover mídia da tabela:',
          deleteMediaError
        );
      }
    }

    /*
     * ========================================================
     * REORGANIZA POSIÇÕES
     * ========================================================
     */

    for (
      let index = 0;
      index <
      keptExistingMedia.length;
      index++
    ) {
      const media =
        keptExistingMedia[
          index
        ];

      await supabase
        .from(
          'chapter_media'
        )
        .update({
          position:
            index,
        })
        .eq(
          'id',
          media.id
        );
    }

    /*
     * ========================================================
     * UPLOAD DAS NOVAS MÍDIAS
     * ========================================================
     */

    const uploadedMedia =
      [];

    for (
      let index = 0;
      index <
      mediaFiles.length;
      index++
    ) {
      const file =
        mediaFiles[index];

      const mediaType =
        ALLOWED_MEDIA_TYPES[
          file.type
        ];

      const extension =
        extensionFromMime(
          file.type
        );

      const uniqueName =
        crypto.randomUUID() +
        '.' +
        extension;

      const storagePath =
        userId +
        '/' +
        chapter.story_id +
        '/' +
        id +
        '/' +
        uniqueName;

      const fileBuffer =
        Buffer.from(
          await file.arrayBuffer()
        );


      const {
        error: uploadError,
      } =
        await mediaStorage(supabase, 'chapter-media')
          .upload(
            storagePath,
            fileBuffer,
            {
              contentType:
                file.type,
              upsert: false,
            }
          );

      if (uploadError) {
        console.error(
          'Erro ao enviar mídia:',
          uploadError
        );

        return NextResponse.json(
          {
            error:
              'Não foi possível enviar o arquivo "' +
              file.name +
              '".',
          },
          {
            status: 500,
            headers:
              noCacheHeaders(),
          }
        );
      }

      const {
        data:
          publicUrlData,
      } =
        mediaStorage(supabase, 'chapter-media')
          .getPublicUrl(
            storagePath
          );

      const position =
        keptExistingMedia.length +
        index;

      const {
        data: mediaRow,
        error:
          mediaInsertError,
      } =
        await supabase
          .from(
            'chapter_media'
          )
          .insert({
            chapter_id:
              id,
            media_url:
              publicUrlData.publicUrl,
            media_type:
              mediaType,
            position,
          })
          .select(`
            id,
            chapter_id,
            media_url,
            media_type,
            position,
            created_at
          `)
          .single();

      if (
        mediaInsertError
      ) {
        console.error(
          'Erro ao salvar referência da mídia:',
          mediaInsertError
        );

        await mediaStorage(supabase, 'chapter-media')
          .remove([
            storagePath,
          ]);

        return NextResponse.json(
          {
            error:
              'O arquivo foi enviado, mas não foi possível registrá-lo no capítulo.',
          },
          {
            status: 500,
            headers:
              noCacheHeaders(),
          }
        );
      }

      uploadedMedia.push(
        mediaRow
      );
    }

    /*
     * ========================================================
     * ESTADO FINAL DAS MÍDIAS
     * ========================================================
     */

    const {
      data: finalMedia,
    } = await supabase
      .from('chapter_media')
      .select(`
        id,
        chapter_id,
        media_url,
        media_type,
        position,
        created_at
      `)
      .eq(
        'chapter_id',
        id
      )
      .order('position', {
        ascending: true,
      });

    /*
     * ========================================================
     * RESPOSTA FINAL
     * ========================================================
     */

    const publicationActor=await chatActor();
    if(!publicationActor)return NextResponse.json({error:'Sua sessão expirou.'},{status:401,headers:noCacheHeaders()});
    const publication=await supabase.rpc('set_chapter_publication',{p_session:publicationActor.sessionTokenHash,p_chapter:id,p_status:publicationStatus,p_scheduled_for:scheduledDate?.toISOString()||null});
    if(publication.error)throw publication.error;
    return NextResponse.json(
      {
        success: true,

        message:
          publicationStatus ===
          'published'
            ? 'Capítulo publicado com sucesso!'
            : publicationStatus ===
                'scheduled'
              ? 'Capítulo agendado com sucesso!'
              : publicationStatus ===
                  'unpublished'
                ? 'Capítulo retirado do ar com sucesso!'
                : 'Rascunho salvo com sucesso!',

        chapter: publication.data,

        media:
          finalMedia || [],

        scheduled:
          publicationStatus ===
          'scheduled',

        scheduled_for:
          scheduledDate
            ? scheduledDate.toISOString()
            : null,

        /*
         * Informações úteis para o frontend
         * confirmar qual status realmente foi salvo.
         */
        publication_status:
          publicationStatus,

        published,

        status_was_provided:
          statusWasProvided,

        scheduled_for_was_provided:
          scheduledForWasProvided,
      },
      {
        status: 200,
        headers: noCacheHeaders(),
      }
    );
  } catch (error) {
    console.error(
      'Erro inesperado ao editar capítulo:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Não foi possível salvar as alterações do capítulo.',
      },
      {
        status: 500,
        headers: noCacheHeaders(),
      }
    );
  }
}
