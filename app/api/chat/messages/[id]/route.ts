import { getSessionTokenHash } from '@/lib/auth/session';
import { d1Chat } from '@/lib/database/d1-chat';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { chatActor, chatDb, allowedThread, privateHeaders, sameOrigin, uuid } from '@/lib/chat/server';
import { chatCipherVersion, chatMediaBucket, chatMediaPath, encodeChatBody, encryptChat } from '@/lib/chat/crypto';
import { mediaStorage } from '@/lib/media/storage';

function respond(body: object, status = 200) {
  return Response.json(body, { status, headers: privateHeaders });
}

async function changeMessage(request: Request, id: string, revoke: boolean) {
  try {
    if (!sameOrigin(request)) return respond({ error: 'Acesso restrito.' }, 403);
    const d1 = getD1PreviewDatabase('auth');
    const hash = d1 ? await getSessionTokenHash() : null;
    const actor = d1 ? null : await chatActor();
    const activeSession = d1 && hash
      ? await d1.prepare('SELECT 1 FROM d1_social_actors WHERE token_hash = ?').bind(hash).first()
      : null;
    if (!actor && !activeSession) return respond({ error: 'Entre na sua conta.' }, 401);
    if (!uuid.test(id)) return respond({ error: 'Mensagem indisponível.' }, 404);
    const raw = await request.text();
    const body = raw.length <= 25_000 ? await new Response(raw).json().catch(() => null) : null;
    const threadId = body?.thread_id;
    const text = typeof body?.body === 'string' ? body.body.trim() : '';
    if (typeof threadId !== 'string' || !uuid.test(threadId) || (!revoke && (!text || text.length > 4000))) {
      return respond({ error: 'Confira a mensagem e o limite de 4000 caracteres.' }, 400);
    }
    if (d1 && hash && activeSession) {
      const chat = d1Chat(d1, chatCipherVersion());
      const thread = await chat.thread(hash, threadId);
      if (!thread || thread.member_status !== 'accepted' || (!revoke && thread.blocked)) {
        return respond({ error: 'Conversa indisponível.' }, 403);
      }
      const encrypted = encodeChatBody(encryptChat(Buffer.from(revoke ? '' : text), `${threadId}:${id}:body`));
      const changed = await chat.change(hash, threadId, id, encrypted, revoke);
      if (!changed) return respond({ error: 'Prazo de duas horas encerrado ou mensagem indisponível.' }, 409);
      // Copied attachments may still be referenced by the live Supabase row.
      return respond(revoke ? { revoked_at: changed.revoked_at } : { edited_at: changed.edited_at, body: text });
    }

    if (!actor) return respond({ error: 'Entre na sua conta.' }, 401);
    const thread = await allowedThread(actor.profileId, threadId);
    if (!thread || thread.status !== 'accepted' || (!revoke && thread.blocked)) {
      return respond({ error: 'Conversa indisponível.' }, 403);
    }

    const bodyCipher = encodeChatBody(encryptChat(Buffer.from(revoke ? '' : text), `${threadId}:${id}:body`));
    const result = await chatDb.rpc('change_own_chat_message', {
      p_sender: actor.profileId, p_thread: threadId, p_message: id,
      p_version: chatCipherVersion(), p_cipher: bodyCipher, p_revoke: revoke,
    }).maybeSingle<{ changed_at: string; attachment_path: string | null }>();
    if (result.error) throw result.error;
    if (!result.data) return respond({ error: 'Prazo de duas horas encerrado ou mensagem indisponível.' }, 409);

    const { changed_at: timestamp, attachment_path: attachmentPath } = result.data;
    if (attachmentPath && attachmentPath === chatMediaPath(threadId, id)) {
      try {
        const removal = await mediaStorage(chatDb, chatMediaBucket).remove([attachmentPath]);
        if (removal.error) console.error('Unable to clean up revoked chat attachment');
      } catch {
        console.error('Unable to clean up revoked chat attachment');
      }
    }
    return respond(revoke ? { revoked_at: timestamp } : { edited_at: timestamp, body: text });
  } catch {
    return respond({ error: 'Não foi possível alterar a mensagem.' }, 503);
  }
}

type Route = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, { params }: Route) {
  return changeMessage(request, (await params).id, false);
}
export async function DELETE(request: Request, { params }: Route) {
  return changeMessage(request, (await params).id, true);
}
