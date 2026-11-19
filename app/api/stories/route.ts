import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1FollowActor } from '@/lib/database/d1-follow-http';
import { d1SocialStoryList } from '@/lib/database/d1-social-stories';
import { getMediaBucket } from '@/lib/media/r2-binding';
import { uuid } from '@/lib/chat/server';
import { mediaStorage } from '@/lib/media/storage';
import { imageMatchesType } from '@/lib/security/uploads';
import { contentMediaUrl } from '@/lib/security/content-media';
import { privateHeaders } from '@/lib/discovery/server';
import {hiddenFeedProfiles} from '@/lib/moderation/feed-controls';
import {currentViewerProfileId, getPublicProfileIds} from '@/lib/moderation/content-visibility';
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

export async function GET() {
  try {
    const db = getD1PreviewDatabase('auth');
    if (db) {
      const actor = await d1FollowActor(db);
      const rows = actor ? await d1SocialStoryList(db,actor.hash) : [];
      return NextResponse.json({stories:rows.map(story=>({...story,media_url:contentMediaUrl(story.media_url)}))},
        {headers:privateHeaders});
    }
    const userId = await currentViewerProfileId(supabaseAdmin);

    if (!userId) {
      return NextResponse.json(
        {
          stories: [],
        },
        { headers: privateHeaders }
      );
    }

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
          userId
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
      userId,
      ...followedIds,
    ];

    const hiddenProfiles=await hiddenFeedProfiles();
    const uniqueUserIds =
      Array.from(
        new Set(userIds.filter(id=>!hiddenProfiles.has(id)))
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
            avatar_url, verified, is_official
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
          media_url: contentMediaUrl(story.media_url),
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
      },
      { headers: privateHeaders }
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
    const db = getD1PreviewDatabase('auth');
    const actor = db ? await d1FollowActor(db) : null;
    const userId = db ? actor?.id : await currentViewerProfileId(supabaseAdmin);

    if (!userId) {
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
    const {data:profile,error:profileError} = db ? {
      data:await db.prepare('SELECT id,username,avatar_url,verified,is_official FROM profiles WHERE id=?')
        .bind(userId).first<{id:string;username:string;avatar_url:string|null;verified:number;is_official:number}>(),
      error:null,
    } : await supabaseAdmin.from('profiles').select('id, username, avatar_url, verified, is_official')
      .eq('id',userId).maybeSingle();

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

    const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];

    const storagePath =
      `${userId}/${crypto.randomUUID()}.${extension}`;

    if (!db) uploadedPath = storagePath;

    const arrayBuffer =
      await file.arrayBuffer();

    const buffer =
      Buffer.from(
        arrayBuffer
      );
    if (!imageMatchesType(buffer, file.type)) {
      return NextResponse.json({ error: 'O conteúdo do arquivo não corresponde ao formato da imagem.' }, { status: 415 });
    }


    if (db && actor) {
      const bucket = getMediaBucket();
      const path = 'd1-social-stories/' + storagePath;
      const key = BUCKET + '/' + path;
      const mediaUrl = '/api/content-media?' + new URLSearchParams({bucket:BUCKET,path});
      if (!await bucket?.put(key,buffer,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:file.type}})) {
        throw Error('Story media upload failed');
      }
      const id = crypto.randomUUID();
      let saved = false;
      try {
        const story = await db.prepare(`INSERT INTO social_stories(id,user_id,media_url,media_type,thought)
          SELECT ?2,profile_id,?3,?4,?5 FROM d1_social_actors WHERE token_hash=?1
          RETURNING id,user_id,media_url,media_type,thought,created_at,expires_at`)
          .bind(actor.hash,id,mediaUrl,file.type==='image/gif'?'gif':'image',thought || null).first<object>();
        if (!story) throw Error('Story could not be saved');
        saved = true;
        return NextResponse.json({story:{...story,user:{...profile,verified:Boolean(profile.verified),
          is_official:Boolean(profile.is_official)}}},{status:201,headers:privateHeaders});
      } finally {
        if (!saved) {
          const existing = await db.prepare('SELECT id FROM social_stories WHERE id=?').bind(id).first().catch(()=>undefined);
          if (existing===null) await bucket?.delete([key]).catch(()=>undefined);
        }
      }
    }

    /*
     * Upload.
     */
    const {
      error: uploadError,
    } =
      await mediaStorage(supabaseAdmin, BUCKET)
        .upload(
          storagePath,
          buffer,
          {
            contentType:
              file.type,
            cacheControl: '3600',
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
      mediaStorage(supabaseAdmin, BUCKET)
        .getPublicUrl(
          storagePath
        );

    const mediaUrl =
      publicUrlData
        ?.publicUrl;

    if (!mediaUrl) {
      await mediaStorage(supabaseAdmin, BUCKET)
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
            userId,
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
      await mediaStorage(supabaseAdmin, BUCKET)
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

    return NextResponse.json(
      {
        story: {
          ...story,
          media_url: contentMediaUrl(story.media_url),
          user: profile,
        },
      },
      {
        status: 201,
        headers: privateHeaders,
      }
    );
  } catch (error) {
    console.error(
      '[SOCIAL STORIES] POST erro inesperado:',
      error
    );

    if (uploadedPath) {
      try {
        await mediaStorage(supabaseAdmin, BUCKET)
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
    const db = getD1PreviewDatabase('auth');
    const actor = db ? await d1FollowActor(db) : null;
    const userId = db ? actor?.id : await currentViewerProfileId(supabaseAdmin);

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

    if (db && actor) {
      const story = typeof storyId==='string' && uuid.test(storyId) ? await db.prepare(`DELETE FROM social_stories
        WHERE id=?2 AND user_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?1)
        RETURNING media_url`).bind(actor.hash,storyId.toLowerCase()).first<{media_url:string}>() : null;
      if (!story) return NextResponse.json({error:'Story não encontrado.'},{status:404});
      if (story.media_url.startsWith('/api/content-media?')) {
        const path = new URL(story.media_url,request.url).searchParams.get('path');
        if (path?.startsWith('d1-social-stories/' + actor.id + '/')) {
          await getMediaBucket()?.delete([BUCKET+'/'+path]).catch(()=>undefined);
        }
      }
      return NextResponse.json({success:true});
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
          userId
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
          userId
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
          await mediaStorage(supabaseAdmin, BUCKET)
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
