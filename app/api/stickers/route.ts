import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1FollowActor } from '@/lib/database/d1-follow-http';
import { getMediaBucket } from '@/lib/media/r2-binding';
import { mediaStorage } from '@/lib/media/storage';
import { imageMatchesType } from '@/lib/security/uploads';
import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
process.env.SUPABASE_SECRET_KEY!
);

async function getUserId(request: Request) {
const cookieHeader = request.headers.get('cookie') || '';

const match = cookieHeader.match(
/toriland_session=([^;]+)/
);

if (!match) {
return null;
}

const token = match[1];

const tokenHash = createHash('sha256')
.update(token)
.digest('hex');

const { data: session } = await supabase
.from('auth_sessions')
.select('user_id, expires_at')
.eq('token_hash', tokenHash)
.maybeSingle();

if (!session) {
return null;
}

if (new Date(session.expires_at) < new Date()) {
return null;
}

return session.user_id;
}

export async function GET(request: Request) {
try {
const db = getD1PreviewDatabase('auth');
const actor = db ? await d1FollowActor(db) : null;
const userId = db ? actor?.id : await getUserId(request);

if (!userId) {
  return NextResponse.json(
    {
      error: 'Você precisa estar logado.',
    },
    { status: 401 }
  );
}

if (db && actor) {
  const result = await db.prepare(`SELECT id,image_url,created_at,last_used_at FROM user_stickers
    WHERE user_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?)
    ORDER BY last_used_at DESC NULLS LAST,created_at DESC,id`).bind(actor.hash).all();
  if (!result.success) throw Error('Stickers unavailable');
  return NextResponse.json({stickers:result.results});
}

const { data: stickers, error } = await supabase
  .from('user_stickers')
  .select(`
    id,
    image_url,
    created_at,
    last_used_at
  `)
  .eq('user_id', userId)
  .order('last_used_at', {
    ascending: false,
    nullsFirst: false,
  })
  .order('created_at', {
    ascending: false,
  });

if (error) {
  return NextResponse.json(
    {
      error: 'Não foi possível carregar suas figurinhas.',
    },
    { status: 500 }
  );
}

return NextResponse.json({
  stickers: stickers || [],
});

} catch {
return NextResponse.json(
{
error: 'Não foi possível carregar suas figurinhas.',
},
{ status: 500 }
);
}
}

export async function POST(request: Request) {
try {
const db = getD1PreviewDatabase('auth');
const actor = db ? await d1FollowActor(db) : null;
const userId = db ? actor?.id : await getUserId(request);

if (!userId) {
  return NextResponse.json(
    {
      error: 'Você precisa estar logado para criar uma figurinha.',
    },
    { status: 401 }
  );
}

const formData = await request.formData();

const file = formData.get('file');

if (!(file instanceof File)) {
  return NextResponse.json(
    {
      error: 'Nenhuma imagem foi enviada.',
    },
    { status: 400 }
  );
}

const allowedTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

if (!allowedTypes.includes(file.type)) {
  return NextResponse.json(
    {
      error: 'Formato de imagem não permitido.',
    },
    { status: 400 }
  );
}

const maxSize = 10 * 1024 * 1024;

if (file.size > maxSize) {
  return NextResponse.json(
    {
      error: 'A imagem deve ter no máximo 10 MB.',
    },
    { status: 400 }
  );
}

const extensionMap: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const extension = extensionMap[file.type];

const fileName = `${crypto.randomUUID()}.${extension}`;

const filePath = `${userId}/${fileName}`;

const arrayBuffer = await file.arrayBuffer();
    if (!imageMatchesType(new Uint8Array(arrayBuffer), file.type)) {
      return NextResponse.json({ error: 'O conteúdo do arquivo não corresponde ao formato da imagem.' }, { status: 415 });
    }


if (db && actor) {
  const bucket = getMediaBucket();
  const path = 'stickers/' + filePath;
  if (!await bucket?.put(path,arrayBuffer,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:file.type}})) {
    throw Error('Sticker upload failed');
  }
  const id = crypto.randomUUID();
  const url = '/api/public-media/' + path;
  let saved = false;
  try {
    const sticker = await db.prepare(`INSERT INTO user_stickers(id,user_id,image_url)
      SELECT ?2,profile_id,?3 FROM d1_social_actors WHERE token_hash=?1
      RETURNING id,image_url,created_at,last_used_at`).bind(actor.hash,id,url).first();
    if (!sticker) throw Error('Sticker could not be saved');
    saved = true;
    return NextResponse.json({sticker},{status:201});
  } finally {
    if (!saved) {
      const record = await db.prepare('SELECT id FROM user_stickers WHERE id=?').bind(id).first()
        .catch(() => undefined);
      if (record === null) await bucket?.delete([path]).catch(() => undefined);
    }
  }
}

const { error: uploadError } = await mediaStorage(supabase, 'stickers')
  .upload(filePath, arrayBuffer, {
    contentType: file.type,
    upsert: false,
  });

if (uploadError) {
  return NextResponse.json(
    {
      error: 'Não foi possível enviar a figurinha.',
    },
    { status: 500 }
  );
}

const {
  data: publicUrlData,
} = mediaStorage(supabase, 'stickers')
  .getPublicUrl(filePath);

const imageUrl = publicUrlData.publicUrl;

const { data: sticker, error: stickerError } =
  await supabase
    .from('user_stickers')
    .insert({
      user_id: userId,
      image_url: imageUrl,
    })
    .select(`
      id,
      image_url,
      created_at,
      last_used_at
    `)
    .single();

if (stickerError) {
  await mediaStorage(supabase, 'stickers')
    .remove([filePath]);

  return NextResponse.json(
    {
      error: 'Não foi possível salvar a figurinha.',
    },
    { status: 500 }
  );
}

return NextResponse.json(
  {
    sticker,
  },
  { status: 201 }
);

} catch {
return NextResponse.json(
{
error: 'Não foi possível criar a figurinha.',
},
{ status: 500 }
);
}
}
