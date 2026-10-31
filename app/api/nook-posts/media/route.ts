import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { isPublicPostVisible } from '@/lib/moderation/content-visibility';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_MEDIA = 4;

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

async function getCurrentUserId(
  request: NextRequest
) {
  try {
    const cookieHeader =
      request.headers.get('cookie') || '';

    const match =
      cookieHeader.match(
        /(?:^|;\s*)toriland_session=([^;]+)/
      );

    if (!match) {
      return null;
    }

    const token = decodeURIComponent(
      match[1]
    );

    const tokenHash =
      createHash('sha256')
        .update(token)
        .digest('hex');

    const {
      data: session,
      error: sessionError,
    } = await supabase
      .from('auth_sessions')
      .select('user_id, expires_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (
      sessionError ||
      !session
    ) {
      return null;
    }

    if (
      session.expires_at &&
      new Date(
        session.expires_at
      ).getTime() <= Date.now()
    ) {
      await supabase
        .from('auth_sessions')
        .delete()
        .eq(
          'token_hash',
          tokenHash
        );

      return null;
    }

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from('profiles')
      .select('id')
      .eq(
        'user_id',
        session.user_id
      )
      .maybeSingle();

    if (
      profileError ||
      !profile
    ) {
      return null;
    }

    return profile.id;
  } catch {
    return null;
  }
}

function getExtension(
  file: File
) {
  switch (file.type) {
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

export async function POST(
  request: NextRequest
) {
  const userId =
    await getCurrentUserId(
      request
    );

  if (!userId) {
    return NextResponse.json(
      {
        error:
          'Você precisa estar autenticado.',
      },
      { status: 401 }
    );
  }

  try {
    const formData =
      await request.formData();

    const file =
      formData.get('file');

    const postId =
      formData.get('post_id');

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error:
            'Nenhum arquivo foi enviado.',
        },
        { status: 400 }
      );
    }

    if (
      typeof postId !== 'string' ||
      !postId
    ) {
      return NextResponse.json(
        {
          error:
            'O post não foi informado.',
        },
        { status: 400 }
      );
    }

    if (
      !ALLOWED_TYPES.includes(
        file.type
      )
    ) {
      return NextResponse.json(
        {
          error:
            'Use apenas JPG, PNG, WEBP ou GIF.',
        },
        { status: 400 }
      );
    }

    if (
      file.size >
      MAX_FILE_SIZE
    ) {
      return NextResponse.json(
        {
          error:
            'Cada imagem pode ter no máximo 10 MB.',
        },
        { status: 400 }
      );
    }

    /*
     * Confirma que o post pertence
     * ao usuário autenticado.
     */
    const {
      data: post,
      error: postError,
    } = await supabase
      .from('nook_posts')
      .select('id, user_id')
      .eq('id', postId)
      .maybeSingle();

    if (
      postError ||
      !post ||
      !(await isPublicPostVisible(supabase, postId))
    ) {
      return NextResponse.json(
        {
          error:
            'Post não encontrado.',
        },
        { status: 404 }
      );
    }

    if (
      post.user_id !== userId
    ) {
      return NextResponse.json(
        {
          error:
            'Você não pode adicionar mídia a este post.',
        },
        { status: 403 }
      );
    }

    /*
     * Limite absoluto de 4 mídias
     * por publicação.
     */
    const {
      count,
      error: countError,
    } = await supabase
      .from('nook_post_media')
      .select(
        'id',
        {
          count: 'exact',
          head: true,
        }
      )
      .eq(
        'post_id',
        postId
      );

    if (countError) {
      console.error(
        'Erro ao verificar mídias:',
        countError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível verificar as mídias do post.',
        },
        { status: 500 }
      );
    }

    if (
      (count || 0) >= MAX_MEDIA
    ) {
      return NextResponse.json(
        {
          error:
            'Cada post pode ter no máximo 4 imagens ou GIFs.',
        },
        { status: 400 }
      );
    }

    const extension =
      getExtension(file);

    const randomPart =
      Math.random()
        .toString(36)
        .slice(2, 10);

    const filePath =
      `${userId}/nook-${Date.now()}-${randomPart}.${extension}`;

    const buffer =
      Buffer.from(
        await file.arrayBuffer()
      );

    const {
      error: uploadError,
    } = await supabase.storage
      .from('nook-media')
      .upload(
        filePath,
        buffer,
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
            'Não foi possível enviar a mídia.',
        },
        { status: 500 }
      );
    }

    const {
      data: publicUrlData,
    } =
      supabase.storage
        .from('nook-media')
        .getPublicUrl(
          filePath
        );

    const mediaUrl =
      publicUrlData.publicUrl;

    const mediaType =
      file.type ===
      'image/gif'
        ? 'gif'
        : 'image';

    /*
     * Registra a mídia no banco.
     */
    const {
      data: media,
      error: mediaError,
    } = await supabase
      .from('nook_post_media')
      .insert({
        post_id: postId,
        media_url: mediaUrl,
        media_type: mediaType,
      })
      .select(
        'id, post_id, media_url, media_type, created_at'
      )
      .single();

    if (mediaError) {
      console.error(
        'Erro ao registrar mídia:',
        mediaError
      );

      /*
       * Se o upload funcionou mas
       * o registro falhou, tenta
       * remover o arquivo órfão.
       */
      await supabase.storage
        .from('nook-media')
        .remove([
          filePath,
        ]);

      return NextResponse.json(
        {
          error:
            'A mídia foi enviada, mas não pôde ser registrada.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        media,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      'Erro inesperado ao enviar mídia:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Não foi possível enviar a mídia.',
      },
      { status: 500 }
    );
  }
}
