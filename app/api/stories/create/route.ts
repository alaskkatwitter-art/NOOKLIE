import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1FollowActor } from '@/lib/database/d1-follow-http';
import { getMediaBucket } from '@/lib/media/r2-binding';
import { mediaStorage } from '@/lib/media/storage';
import { spotifyUpdate } from '@/lib/spotify/resolve';
import { imageMatchesType } from '@/lib/security/uploads';
import { ensureCatalogTag } from '@/lib/stories/tags';
import { emptyStoryMetadata, parseStoryMetadata } from '@/lib/stories/metadata';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

function createSlug(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function POST(request: Request) {
  let uploadedCoverPath = '';

  try {
    const db = getD1PreviewDatabase('auth');
    const actor = db ? await d1FollowActor(db) : null;
    let userId: string;
    if (db) {
      if (!actor) return NextResponse.json({error:'Você precisa estar logado.'},{status:401});
      userId = actor.id;
    } else {
      const cookieHeader = request.headers.get('cookie') || '';

      const sessionCookie = cookieHeader
        .split(';')
        .map((cookie) => cookie.trim())
        .find((cookie) =>
          cookie.startsWith('toriland_session=')
        );

      if (!sessionCookie) {
        return NextResponse.json(
          { error: 'Você precisa estar logado.' },
          { status: 401 }
        );
      }

      const sessionToken = decodeURIComponent(
        sessionCookie.substring('toriland_session='.length)
      );

      if (!sessionToken) {
        return NextResponse.json(
          { error: 'Sessão inválida.' },
          { status: 401 }
        );
      }

      const tokenHash = crypto
        .createHash('sha256')
        .update(sessionToken)
        .digest('hex');

      const { data: session, error: sessionError } =
        await supabase
          .from('auth_sessions')
          .select('user_id, expires_at')
          .eq('token_hash', tokenHash)
          .maybeSingle();

      if (
        sessionError ||
        !session ||
        new Date(session.expires_at).getTime() <= Date.now()
      ) {
        return NextResponse.json(
          {
            error:
              'Sua sessão expirou. Entre novamente.',
          },
          { status: 401 }
        );
      }

      userId = session.user_id;
    }

    const formData = await request.formData();
    const music = await spotifyUpdate(formData.get('spotify_url') ?? undefined, null, true);
    if (music instanceof NextResponse) return music;
    let storyMetadata;
    try { storyMetadata = parseStoryMetadata(formData); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Dados inválidos.' }, { status: 400 }); }

    const titleValue = formData.get('title');
    const descriptionValue = formData.get('description');
    const statusValue = formData.get('status');
    const genreValue = formData.get('genre');
    const ratingValue = formData.get('rating');
    const tagsValues = formData.getAll('tags');
    const coverValue = formData.get('cover');

    const title =
      typeof titleValue === 'string'
        ? titleValue.trim()
        : '';

    const description =
      typeof descriptionValue === 'string'
        ? descriptionValue.trim()
        : '';

    const status =
      typeof statusValue === 'string'
        ? statusValue.trim()
        : 'Em andamento';

    const genre =
      typeof genreValue === 'string'
        ? genreValue.trim()
        : '';

    const rating =
      typeof ratingValue === 'string'
        ? ratingValue.trim()
        : '';

    const tagsText = tagsValues.filter((value): value is string => typeof value === 'string').join(',');

    if (!title) {
      return NextResponse.json(
        {
          error:
            'O título da história é obrigatório.',
        },
        { status: 400 }
      );
    }

    if (title.length > 100) {
      return NextResponse.json(
        {
          error:
            'O título pode ter no máximo 100 caracteres.',
        },
        { status: 400 }
      );
    }

    if (description.length > 2000) {
      return NextResponse.json(
        {
          error:
            'A sinopse pode ter no máximo 2000 caracteres.',
        },
        { status: 400 }
      );
    }

    const allowedStatuses = [
      'Em andamento',
      'Concluída',
    ];

    if (!allowedStatuses.includes(status)) {
      return NextResponse.json(
        {
          error: 'Status de história inválido.',
        },
        { status: 400 }
      );
    }

    const allowedRatings = [
      '',
      'Livre',
      '10',
      '12',
      '14',
      '16',
      '18',
    ];

    if (!allowedRatings.includes(rating)) {
      return NextResponse.json(
        {
          error:
            'Classificação de história inválida.',
        },
        { status: 400 }
      );
    }

    const tagNames = tagsText
      .split(',')
      .map(tag => tag.trim().replace(/^#+/, '').trim())
      .filter(Boolean);

    const uniqueTagNames = Array.from(
      new Map(
        tagNames.map((tag) => [
          createSlug(tag),
          tag,
        ])
      ).values()
    );

    if (genre) {
      const genreSlug = createSlug(genre);

      const alreadyExists = uniqueTagNames.some(
        (tag) => createSlug(tag) === genreSlug
      );

      if (!alreadyExists) {
        uniqueTagNames.push(genre);
      }
    }

    const limitedTags =
      uniqueTagNames.slice(0, 30);

    const storyId = crypto.randomUUID();
    const bucket = db ? getMediaBucket() : undefined;
    let d1CoverKey: string | undefined;
    let coverUrl: string | null = null;

    if (
      coverValue instanceof File &&
      coverValue.size > 0
    ) {
      const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
      ];

      if (!allowedTypes.includes(coverValue.type)) {
        return NextResponse.json(
          {
            error:
              'Formato de capa inválido. Use JPG, PNG ou WEBP.',
          },
          { status: 400 }
        );
      }

      if (coverValue.size > 8 * 1024 * 1024) {
        return NextResponse.json(
          {
            error:
              'A capa pode ter no máximo 8 MB.',
          },
          { status: 400 }
        );
      }

      const extension =
        coverValue.type === 'image/jpeg'
          ? 'jpg'
          : coverValue.type === 'image/png'
          ? 'png'
          : 'webp';

      const arrayBuffer =
        await coverValue.arrayBuffer();

      const fileBuffer = Buffer.from(arrayBuffer);
      if (!imageMatchesType(fileBuffer, coverValue.type)) {
        return NextResponse.json({ error: 'O conteúdo do arquivo não corresponde ao formato da imagem.' }, { status: 415 });
      }


      if (db && actor) {
        const path = `d1-stories/${actor.id}/${storyId}/cover.${extension}`;
        const key = 'story-covers/' + path;
        if (!await bucket?.put(key,fileBuffer,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:coverValue.type}})) {
          throw Error('Unable to store story cover');
        }
        d1CoverKey = key;
        coverUrl = '/api/content-media?' + new URLSearchParams({bucket:'story-covers',path});
      } else {
        uploadedCoverPath = `${userId}/story-${Date.now()}.${extension}`;
        const { error: uploadError } =
          await mediaStorage(supabase, 'story-covers')
            .upload(
              uploadedCoverPath,
              fileBuffer,
              {
                contentType: coverValue.type,
                upsert: false,
              }
            );

        if (uploadError) {
          return NextResponse.json(
            {
              error:
                'Não foi possível enviar a capa da história.',
            },
            { status: 500 }
          );
        }

        const { data: publicUrlData } =
          mediaStorage(supabase, 'story-covers')
            .getPublicUrl(uploadedCoverPath);

        coverUrl = publicUrlData.publicUrl;
      }
    }

    if (db && actor) {
      const data = {
        ...emptyStoryMetadata,...storyMetadata,title,description:description || null,status,rating:rating || null,
        cover_url:coverUrl,spotify_link:music.spotify_link ? JSON.stringify(music.spotify_link) : null,
      };
      const columns = Object.keys(data);
      const values = Object.values(data).map(value=>typeof value==='boolean'?Number(value):value);
      const insert = db.prepare(`INSERT INTO stories(id,author_id,${columns.join(',')},release_at)
        SELECT ?,profile_id,${columns.map(()=>'?').join(',')},'infinity'
        FROM d1_social_actors WHERE token_hash=?`).bind(storyId,...values,actor.hash);
      const statements = [insert];
      for (const name of limitedTags) {
        const slug = createSlug(name);
        if (!slug) continue;
        statements.push(db.prepare(`INSERT INTO tags(id,name,slug,category_id,created_by)
          SELECT ?2,?3,?4,(SELECT id FROM tag_categories WHERE slug=?5),author_id FROM stories WHERE id=?1
          AND NOT EXISTS(SELECT 1 FROM tags WHERE slug=?4 OR lower(name)=lower(?3))
          ON CONFLICT DO NOTHING`).bind(storyId,crypto.randomUUID(),name,slug,genre && slug===createSlug(genre)?'genre':'freeform'));
        statements.push(db.prepare(`INSERT INTO story_tags(story_id,tag_id)
          SELECT s.id,t.id FROM stories s JOIN tags t ON t.slug=?3 OR lower(t.name)=lower(?2) WHERE s.id=?1
          ORDER BY lower(t.name)=lower(?2) DESC,t.id LIMIT 1 ON CONFLICT DO NOTHING`).bind(storyId,name,slug));
      }
      try {
        const result = await db.batch(statements);
        if (result.some(row=>!row.success) || !result[0].meta.changes) throw Error('Unable to create story');
      } catch (error) {
        const row = await db.prepare('SELECT id FROM stories WHERE id=?').bind(storyId).first().catch(()=>undefined);
        if (row === null && d1CoverKey) await bucket?.delete([d1CoverKey]).catch(()=>undefined);
        if (row === null && error instanceof Error && error.message.includes('stories_series_volume_key')) {
          return NextResponse.json({error:'Já existe um livro com esse número nesta série.'},{status:500});
        }
        if (!row) throw error;
      }
      const story = await db.prepare(`SELECT id,author_id,title,description,cover_url,status,rating,created_at,updated_at
        FROM stories WHERE id=?`).bind(storyId).first();
      if (!story) throw Error('Story unavailable');
      return NextResponse.json({message:'História criada com sucesso.',story},{status:201});
    }

    const { data: story, error: storyError } =
      await supabase
        .from('stories')
        .insert({
          ...storyMetadata,
          ...music,
          author_id: userId,
          title,
          description: description || null,
          cover_url: coverUrl,
          status,
          rating: rating || null,
        })
        .select(
          'id, author_id, title, description, cover_url, status, rating, created_at, updated_at'
        )
        .single();

    if (storyError || !story) {
      if (uploadedCoverPath) {
        await mediaStorage(supabase, 'story-covers')
          .remove([uploadedCoverPath]);
      }

      return NextResponse.json(
        {
          error:
            storyError?.code === '23505' ? 'Já existe um livro com esse número nesta série.' : 'Não foi possível criar a história.',
        },
        { status: 500 }
      );
    }

    if (limitedTags.length > 0) {
      const { data: genreCategory } =
        await supabase
          .from('tag_categories')
          .select('id')
          .eq('slug', 'genre')
          .maybeSingle();

      const { data: freeformCategory } =
        await supabase
          .from('tag_categories')
          .select('id')
          .eq('slug', 'freeform')
          .maybeSingle();

      const tagIds: string[] = [];

      for (const tagName of limitedTags) {
        const tagSlug = createSlug(tagName);

        if (!tagSlug) {
          continue;
        }

        const isGenre =
          genre &&
          createSlug(genre) === tagSlug;

        const categoryId = isGenre
          ? genreCategory?.id || null
          : freeformCategory?.id || null;

        const tag = await ensureCatalogTag(supabase, tagName, categoryId, userId);
        if (tag) tagIds.push(tag.id);
      }

      if (tagIds.length > 0) {
        const storyTags = tagIds.map((tagId) => ({
          story_id: story.id,
          tag_id: tagId,
        }));

        const { error: storyTagsError } =
          await supabase
            .from('story_tags')
            .insert(storyTags);

        if (storyTagsError) {
          console.error(
            'Erro ao relacionar tags:',
            storyTagsError
          );
        }
      }
    }

    return NextResponse.json(
      {
        message:
          'História criada com sucesso.',
        story,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      'Erro ao criar história:',
      error
    );

    if (uploadedCoverPath) {
      await mediaStorage(supabase, 'story-covers')
        .remove([uploadedCoverPath]);
    }

    return NextResponse.json(
      {
        error:
          'Não foi possível criar a história.',
      },
      { status: 500 }
    );
  }
}
