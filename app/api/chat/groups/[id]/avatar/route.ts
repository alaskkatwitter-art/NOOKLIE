import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  chatActor,
  chatDb,
  allowedThread,
  privateHeaders,
  sameOrigin,
} from '@/lib/chat/server';
import { imageMatchesType } from '@/lib/security/uploads';
import { rateLimitKey } from '@/lib/security/rate-key';
type Context = { params: Promise<{ id: string }> };
const bucket = 'group-avatars',
  limit = 4 * 1024 * 1024;
export async function GET(_request: Request, context: Context) {
  try {
    const actor = await chatActor();
    if (!actor)
      return new NextResponse(null, { status: 401, headers: privateHeaders });
    const { id } = await context.params,
      thread = await allowedThread(actor.profileId, id);
    if (
      !thread ||
      thread.kind !== 'group' ||
      thread.status !== 'accepted' ||
      thread.blocked ||
      !thread.avatar_path
    )
      return new NextResponse(null, { status: 404, headers: privateHeaders });
    const result = await chatDb.storage
      .from(bucket)
      .download(thread.avatar_path);
    if (result.error || !result.data)
      return new NextResponse(null, { status: 404, headers: privateHeaders });
    return new NextResponse(result.data, {
      headers: {
        ...privateHeaders,
        'Content-Type': result.data.type,
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
    const actor = await chatActor();
    if (!actor)
      return new NextResponse(null, { status: 401, headers: privateHeaders });
    const { id } = await context.params,
      thread = await allowedThread(actor.profileId, id);
    if (
      !thread ||
      thread.kind !== 'group' ||
      thread.status !== 'accepted' ||
      thread.blocked ||
      thread.initiator_id !== actor.profileId
    )
      return new NextResponse(null, { status: 403, headers: privateHeaders });
    const rate = await chatDb.rpc('consume_auth_rate_limit', {
      p_key_hash: rateLimitKey('group-avatar', actor.profileId),
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
      const uploaded = await chatDb.storage
        .from(bucket)
        .upload(path, bytes, { contentType: file.type, upsert: false });
      if (uploaded.error) throw uploaded.error;
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
      if (path) await chatDb.storage.from(bucket).remove([path]);
      return NextResponse.json(
        { error: 'O grupo mudou. Atualize a conversa e tente novamente.' },
        { status: 409, headers: privateHeaders },
      );
    }
    if (thread.avatar_path)
      await chatDb.storage.from(bucket).remove([thread.avatar_path]);
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
