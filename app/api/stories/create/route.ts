import { parseStoryMetadata } from '@/lib/stories/metadata';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
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

    const formData = await request.formData();
    let storyMetadata;
    try { storyMetadata = parseStoryMetadata(formData); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Dados inválidos.' }, { status: 400 }); }

    const titleValue = formData.get('title');
    const descriptionValue = formData.get('description');
    const statusValue = formData.get('status');
    const genreValue = formData.get('genre');
    const ratingValue = formData.get('rating');
    const tagsValue = formData.get('tags');
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

    const tagsText =
      typeof tagsValue === 'string'
        ? tagsValue.trim()
        : '';

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

      uploadedCoverPath =
        `${session.user_id}/story-${Date.now()}.${extension}`;

      const arrayBuffer =
        await coverValue.arrayBuffer();

      const fileBuffer = Buffer.from(arrayBuffer);

      const { error: uploadError } =
        await supabase.storage
          .from('story-covers')
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
        supabase.storage
          .from('story-covers')
          .getPublicUrl(uploadedCoverPath);

      coverUrl = publicUrlData.publicUrl;
    }

    const { data: story, error: storyError } =
      await supabase
        .from('stories')
        .insert({
          ...storyMetadata,
          author_id: session.user_id,
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
        await supabase.storage
          .from('story-covers')
          .remove([uploadedCoverPath]);
      }

      return NextResponse.json(
        {
          error:
            storyError?.message ||
            'Não foi possível criar a história.',
        },
        { status: 500 }
      );
    }

    const tagNames = tagsText
      .split(',')
      .map((tag) => tag.trim())
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

        const { data: existingTag } =
          await supabase
            .from('tags')
            .select('id')
            .eq('slug', tagSlug)
            .maybeSingle();

        if (existingTag) {
          tagIds.push(existingTag.id);
          continue;
        }

        const { data: newTag, error: tagError } =
          await supabase
            .from('tags')
            .insert({
              name: tagName,
              slug: tagSlug,
              category_id: categoryId,
              created_by: session.user_id,
            })
            .select('id')
            .single();

        if (!tagError && newTag) {
          tagIds.push(newTag.id);
        }
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
      await supabase.storage
        .from('story-covers')
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
