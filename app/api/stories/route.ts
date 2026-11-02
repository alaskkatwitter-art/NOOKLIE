import {getPublicProfileIds} from '@/lib/moderation/content-visibility';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL!;

const supabaseSecretKey =
  process.env.SUPABASE_SECRET_KEY!;

const supabaseAdmin =
  createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );

const BUCKET =
  'social-stories';

const MAX_FILE_SIZE =
  5 * 1024 * 1024;

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

async function getCurrentUser() {
  try {
    const response =
      await fetch(
        `${process.env.NEXT_PUBLIC_SITE_URL || ''}/api/auth/me`,
        {
          headers: {
            cookie:
              '',
          },
          cache: 'no-store',
        }
      );

    if (!response.ok) {
      return null;
    }

    const data =
      await response.json();

    return data?.user || null;
  } catch {
    return null;
  }
}

async function getAuthenticatedUser(
  request: Request
) {
  try {
    const cookie =
      request.headers.get(
        'cookie'
      ) || '';

    const response =
      await fetch(
        new URL(
          '/api/auth/me',
          request.url
        ),
        {
          headers: {
            cookie,
          },
          cache: 'no-store',
        }
      );

    if (!response.ok) {
      return null;
    }

    const data =
      await response.json();

    return data?.user || null;
  } catch {
    return null;
  }
}

function getStoragePathFromPublicUrl(
  url: string
) {
  const marker =
    `/storage/v1/object/public/${BUCKET}/`;

  const index =
    url.indexOf(marker);

  if (index === -1) {
    return null;
  }

  return decodeURIComponent(
    url.slice(
      index + marker.length
    )
  );
}

export async function GET(
  request: Request
) {
  try {
    const user =
      await getAuthenticatedUser(
        request
      );

    if (!user?.id) {
      return NextResponse.json(
        {
          stories: [],
        }
      );
    }

    /*
     * Remove Stories expirados.
     */
    await supabaseAdmin
      .from('social_stories')
      .delete()
      .lt(
        'expires_at',
        new Date().toISOString()
      );

    /*
     * Descobre quem o usuário segue.
     */
    const {
      data: follows,
      error: followsError,
    } =
      await supabaseAdmin
        .from('follows')
        .select(
          'following_id'
        )
        .eq(
          'follower_id',
          user.id
        );

    if (followsError) {
      console.error(
        '[SOCIAL STORIES] Erro ao buscar follows:',
        followsError
      );
    }

    const followedIds =
      (follows || []).map(
        (follow) =>
          follow.following_id
      );

    const userIds = [
      user.id,
      ...followedIds,
    ];

    const uniqueUserIds =
      Array.from(
        new Set(userIds)
      );

    const {
      data: stories,
      error,
    } =
      await supabaseAdmin
        .from('social_stories')
        .select(
          `
          id,
          user_id,
          media_url,
          media_type,
          thought,
          created_at,
          expires_at,
          user:profiles!social_stories_user_id_fkey(
            id,
            username,
            avatar_url
          )
        `
        )
        .in(
          'user_id',
          uniqueUserIds
        )
        .gt(
          'expires_at',
          new Date().toISOString()
        )
        .order(
          'created_at',
          {
            ascending: true,
          }
        );

    if (error) {
      console.error(
        '[SOCIAL STORIES] Erro ao buscar:',
        error
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível carregar os Stories.',
        },
        {
          status: 500,
        }
      );
    }

    const allowed=await getPublicProfileIds(supabaseAdmin,(stories||[]).map(s=>s.user_id));
    const normalizedStories =
      (stories || []).filter(s=>allowed.has(s.user_id)).map(
        (story: any) => ({
          ...story,
          user: Array.isArray(
            story.user
          )
            ? story.user[0] ||
              null
            : story.user ||
              null,
        })
      );

    return NextResponse.json(
      {
        stories:
          normalizedStories,
      }
    );
  } catch (error) {
    console.error(
      '[SOCIAL STORIES] GET erro inesperado:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Erro interno ao carregar Stories.',
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
  request: Request
) {
  let uploadedPath: string | null =
    null;

  try {
    const user =
      await getAuthenticatedUser(
        request
      );

    if (!user?.id) {
      return NextResponse.json(
        {
          error:
            'Você precisa estar logado para publicar um Story.',
        },
        {
          status: 401,
        }
      );
    }

    /*
     * Confirma que o perfil existe.
     */
    const {
      data: profile,
      error: profileError,
    } =
      await supabaseAdmin
        .from('profiles')
        .select(
          'id, username, avatar_url'
        )
        .eq(
          'id',
          user.id
        )
        .maybeSingle();

    if (profileError) {
      console.error(
        '[SOCIAL STORIES] Erro ao buscar perfil:',
        profileError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível verificar seu perfil.',
        },
        {
          status: 500,
        }
      );
    }

    if (!profile) {
      return NextResponse.json(
        {
          error:
            'Seu perfil não foi encontrado.',
        },
        {
          status: 404,
        }
      );
    }

    const formData =
      await request.formData();

    const file =
      formData.get(
        'file'
      );

    const thoughtValue =
      formData.get(
        'thought'
      );

    const captionValue =
      formData.get(
        'caption'
      );

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error:
            'Nenhuma imagem foi enviada.',
        },
        {
          status: 400,
        }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json(
        {
          error:
            'O arquivo enviado está vazio.',
        },
        {
          status: 400,
        }
      );
    }

    if (
      file.size >
      MAX_FILE_SIZE
    ) {
      return NextResponse.json(
        {
          error:
            'A imagem ou GIF deve ter no máximo 5 MB.',
        },
        {
          status: 400,
        }
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
            'Formato não permitido. Use JPG, PNG, WEBP ou GIF.',
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Pensamento.
     */
    let thought =
      typeof thoughtValue ===
      'string'
        ? thoughtValue.trim()
        : '';

    if (
      thought.length >
      100
    ) {
      thought =
        thought.slice(
          0,
          100
        );
    }

    /*
     * Legenda fica preparada,
     * mas não é salva porque a tabela
     * atualmente não possui coluna caption.
     */
    const caption =
      typeof captionValue ===
      'string'
        ? captionValue.trim()
        : '';

    console.log(
      '[SOCIAL STORIES] Publicando Story:',
      {
        userId: user.id,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        thought:
          thought || null,
        caption:
          caption || null,
      }
    );

    /*
     * Caminho único no Storage.
     */
    const extension =
      file.name
        .split('.')
        .pop()
        ?.toLowerCase() ||
      'jpg';

    const storagePath =
      `${user.id}/${crypto.randomUUID()}.${extension}`;

    uploadedPath =
      storagePath;

    const arrayBuffer =
      await file.arrayBuffer();

    const buffer =
      Buffer.from(
        arrayBuffer
      );

    /*
     * Upload.
     */
    const {
      error: uploadError,
    } =
      await supabaseAdmin
        .storage
        .from(BUCKET)
        .upload(
          storagePath,
          buffer,
          {
            contentType:
              file.type,
            upsert: false,
          }
        );

    if (uploadError) {
      console.error(
        '[SOCIAL STORIES] Erro no upload:',
        uploadError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível enviar a imagem.',
        },
        {
          status: 500,
        }
      );
    }

    /*
     * URL pública.
     */
    const {
      data: publicUrlData,
    } =
      supabaseAdmin
        .storage
        .from(BUCKET)
        .getPublicUrl(
          storagePath
        );

    const mediaUrl =
      publicUrlData
        ?.publicUrl;

    if (!mediaUrl) {
      await supabaseAdmin
        .storage
        .from(BUCKET)
        .remove([
          storagePath,
        ]);

      uploadedPath = null;

      return NextResponse.json(
        {
          error:
            'Não foi possível gerar a URL da imagem.',
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Tipo do Story.
     */
    const mediaType =
      file.type ===
      'image/gif'
        ? 'gif'
        : 'image';

    /*
     * Expiração de 24 horas.
     */
    const expiresAt =
      new Date(
        Date.now() +
          24 *
            60 *
            60 *
            1000
      ).toISOString();

    /*
     * Salva no banco.
     */
    const {
      data: story,
      error: insertError,
    } =
      await supabaseAdmin
        .from(
          'social_stories'
        )
        .insert({
          user_id:
            user.id,
          media_url:
            mediaUrl,
          media_type:
            mediaType,
          thought:
            thought ||
            null,
          created_at:
            new Date().toISOString(),
          expires_at:
            expiresAt,
        })
        .select(
          `
          id,
          user_id,
          media_url,
          media_type,
          thought,
          created_at,
          expires_at
        `
        )
        .single();

    if (insertError) {
      console.error(
        '[SOCIAL STORIES] ERRO AO SALVAR NO BANCO:',
        insertError
      );

      /*
       * Se o banco falhar,
       * remove o arquivo que acabou
       * de ser enviado.
       */
      await supabaseAdmin
        .storage
        .from(BUCKET)
        .remove([
          storagePath,
        ]);

      uploadedPath = null;

      return NextResponse.json(
        {
          error:
            'A imagem foi enviada, mas não foi possível salvar o Story.',
        },
        {
          status: 500,
        }
      );
    }

    uploadedPath = null;

    console.log(
      '[SOCIAL STORIES] Story publicado:',
      story.id
    );

    return NextResponse.json(
      {
        story: {
          ...story,
          user: profile,
        },
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      '[SOCIAL STORIES] POST erro inesperado:',
      error
    );

    if (uploadedPath) {
      try {
        await supabaseAdmin
          .storage
          .from(BUCKET)
          .remove([
            uploadedPath,
          ]);
      } catch (cleanupError) {
        console.error(
          '[SOCIAL STORIES] Erro ao limpar upload:',
          cleanupError
        );
      }
    }

    return NextResponse.json(
      {
        error:
          'Erro interno ao publicar o Story.',
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(
  request: Request
) {
  try {
    const user =
      await getAuthenticatedUser(
        request
      );

    if (!user?.id) {
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

    const body =
      await request.json();

    const storyId =
      body?.id;

    if (!storyId) {
      return NextResponse.json(
        {
          error:
            'ID do Story não informado.',
        },
        {
          status: 400,
        }
      );
    }

    const {
      data: story,
      error: findError,
    } =
      await supabaseAdmin
        .from(
          'social_stories'
        )
        .select(
          'id, user_id, media_url'
        )
        .eq(
          'id',
          storyId
        )
        .eq(
          'user_id',
          user.id
        )
        .maybeSingle();

    if (findError) {
      console.error(
        '[SOCIAL STORIES] Erro ao encontrar Story:',
        findError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível encontrar o Story.',
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
            'Story não encontrado.',
        },
        {
          status: 404,
        }
      );
    }

    const {
      error: deleteError,
    } =
      await supabaseAdmin
        .from(
          'social_stories'
        )
        .delete()
        .eq(
          'id',
          storyId
        )
        .eq(
          'user_id',
          user.id
        );

    if (deleteError) {
      console.error(
        '[SOCIAL STORIES] Erro ao excluir banco:',
        deleteError
      );

      return NextResponse.json(
        {
          error:
            'Não foi possível excluir o Story.',
        },
        {
          status: 500,
        }
      );
    }

    /*
     * Remove arquivo do Storage.
     */
    if (story.media_url) {
      const storagePath =
        getStoragePathFromPublicUrl(
          story.media_url
        );

      if (storagePath) {
        const {
          error: storageError,
        } =
          await supabaseAdmin
            .storage
            .from(BUCKET)
            .remove([
              storagePath,
            ]);

        if (storageError) {
          console.error(
            '[SOCIAL STORIES] Erro ao excluir arquivo:',
            storageError
          );
        }
      }
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      '[SOCIAL STORIES] DELETE erro inesperado:',
      error
    );

    return NextResponse.json(
      {
        error:
          'Erro interno ao excluir o Story.',
      },
      {
        status: 500,
      }
    );
  }
}
