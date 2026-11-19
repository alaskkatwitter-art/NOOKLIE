import { getSessionTokenHash } from '@/lib/auth/session';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1Auth } from '@/lib/database/d1-auth';
import { previewImageStorage } from '@/lib/media/preview-images';
import { mediaStorage } from '@/lib/media/storage';
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  chatActor,
  chatDb,
  allowedThread,
  privateHeaders,
  sameOrigin,
  uuid,
} from '@/lib/chat/server';
import { imageMatchesType } from '@/lib/security/uploads';
import { rateLimitKey } from '@/lib/security/rate-key';
type Context = { params: Promise<{ id: string }> };
const bucket = 'group-avatars',
  limit = 4 * 1024 * 1024;
async function groupAccess(id: string) {
  const db = getD1PreviewDatabase('auth');
  if (!db) {
    const actor = await chatActor();
    return { db,hash:null,actor,thread:actor ? await allowedThread(actor.profileId,id) : null };
  }
  const hash = await getSessionTokenHash();
  const profile = hash && await db.prepare('SELECT profile_id FROM d1_social_actors WHERE token_hash=?')
    .bind(hash).first<{profile_id:string}>();
  const actor = profile ? {profileId:profile.profile_id} : null;
  const thread = actor && await db.prepare(`SELECT kind,member_status AS status,blocked,avatar_path,initiator_id
    FROM d1_chat_access WHERE token_hash=? AND id=?`).bind(hash,id)
    .first<{kind:string;status:string;blocked:number;avatar_path:string|null;initiator_id:string}>();
  return {db,hash,actor,thread};
}
export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    if (!uuid.test(id)) return new NextResponse(null,{status:404,headers:privateHeaders});
    const {db,actor,thread} = await groupAccess(id);
    if (!actor)
      return new NextResponse(null, { status: 401, headers: privateHeaders });
    if (
      !thread ||
      thread.kind !== 'group' ||
      thread.status !== 'accepted' ||
      thread.blocked ||
      !thread.avatar_path
    )
      return new NextResponse(null, { status: 404, headers: privateHeaders });
    if (db && !new RegExp('^'+id+'/[a-f0-9-]{36}\\.(jpg|png|webp)$').test(thread.avatar_path)) {
      return new NextResponse(null,{status:404,headers:privateHeaders});
    }
    const storage = db ? previewImageStorage(bucket) : mediaStorage(chatDb,bucket);
    const result = await storage.download(thread.avatar_path);
    if (result.error || !result.data)
      return new NextResponse(null, { status: 404, headers: privateHeaders });
    return new NextResponse(result.data, {
      headers: {
        ...privateHeaders,
        'Content-Type': db ? (thread.avatar_path.endsWith('.jpg') ? 'image/jpeg' : 'image/' + thread.avatar_path.split('.').pop()) : result.data.type,
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new NextResponse(null, { status: 503, headers: privateHeaders });
  }
}
async function change(request: Request, context: Context, remove: boolean) {
  try {
    if (!sameOrigin(request))
      return new NextResponse(null, { status: 403, headers: privateHeaders });
    const { id } = await context.params;
    if (!uuid.test(id)) return new NextResponse(null,{status:404,headers:privateHeaders});
    const {db,hash,actor,thread} = await groupAccess(id);
    if (!actor)
      return new NextResponse(null, { status: 401, headers: privateHeaders });
    if (
      !thread ||
      thread.kind !== 'group' ||
      thread.status !== 'accepted' ||
      thread.blocked ||
      thread.initiator_id !== actor.profileId
    )
      return new NextResponse(null, { status: 403, headers: privateHeaders });
    const storage = db ? previewImageStorage(bucket) : mediaStorage(chatDb,bucket);
    const key = rateLimitKey('group-avatar',actor.profileId);
    const rate = db ? {data:await d1Auth(db).consumeRateLimit(key,20,3600),error:null}
      : await chatDb.rpc('consume_auth_rate_limit', {
      p_key_hash: key,
      p_limit: 20,
      p_window_seconds: 3600,
    });
    if (rate.error || !rate.data)
      return new NextResponse(null, { status: 429, headers: privateHeaders });
    let path: string | null = null;
    if (!remove) {
      if (Number(request.headers.get('content-length') || 0) > limit + 65536)
        return new NextResponse(null, { status: 413, headers: privateHeaders });
      const form = await request.formData(),
        file = form.get('file');
      if (
        !(file instanceof File) ||
        file.size < 1 ||
        file.size > limit ||
        !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      )
        return NextResponse.json(
          { error: 'Use uma imagem JPG, PNG ou WebP de até 4 MB.' },
          { status: 400, headers: privateHeaders },
        );
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!imageMatchesType(bytes, file.type))
        return NextResponse.json(
          { error: 'Imagem inválida.' },
          { status: 400, headers: privateHeaders },
        );
      path = `${id}/${randomUUID()}.${file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1]}`;
      const uploaded = await storage.upload(path, bytes, { contentType: file.type, upsert: false });
      if (uploaded.error) throw uploaded.error;
    }
    if (db && hash) {
      let saved;
      try {
        saved = await db.prepare(`UPDATE chat_threads SET avatar_path=?1 WHERE id=?2 AND avatar_path IS ?3
          AND EXISTS(SELECT 1 FROM d1_chat_access t WHERE t.id=chat_threads.id AND t.token_hash=?4
            AND t.kind='group' AND t.member_status='accepted' AND t.blocked=0 AND t.initiator_id=t.actor_id)
          RETURNING id`).bind(path,id,thread.avatar_path,hash).first();
      } finally {
        if (!saved && path) await storage.remove([path]).catch(()=>undefined);
      }
      if (!saved) return NextResponse.json({error:'O grupo mudou. Atualize a conversa e tente novamente.'},{status:409,headers:privateHeaders});
      if (thread.avatar_path && new RegExp('^'+id+'/[a-f0-9-]{36}\\.(jpg|png|webp)$').test(thread.avatar_path)) {
        await storage.remove([thread.avatar_path]).catch(()=>undefined);
      }
      return NextResponse.json({saved:true},{headers:privateHeaders});
    }
    const update = chatDb
      .from('chat_threads')
      .update({ avatar_path: path })
      .eq('id', id)
      .eq('kind', 'group')
      .eq('initiator_id', actor.profileId);
    const saved = await (
      thread.avatar_path
        ? update.eq('avatar_path', thread.avatar_path)
        : update.is('avatar_path', null)
    )
      .select('id')
      .maybeSingle();
    // A null value requires IS rather than EQ; the compare-and-swap protects
    // against concurrent photo edits and ownership changes.
    if (saved.error || !saved.data) {
      if (path) await mediaStorage(chatDb, bucket).remove([path]);
      return NextResponse.json(
        { error: 'O grupo mudou. Atualize a conversa e tente novamente.' },
        { status: 409, headers: privateHeaders },
      );
    }
    if (thread.avatar_path)
      await mediaStorage(chatDb, bucket).remove([thread.avatar_path]);
    return NextResponse.json({ saved: true }, { headers: privateHeaders });
  } catch {
    return NextResponse.json(
      { error: 'Não foi possível alterar a foto do grupo.' },
      { status: 503, headers: privateHeaders },
    );
  }
}
export const POST = (request: Request, context: Context) =>
  change(request, context, false);
export const DELETE = (request: Request, context: Context) =>
  change(request, context, true);
