import { chatCipherVersion, decodeChatBody, decryptChat } from '@/lib/chat/crypto';
import type { NooklieD1 } from './d1';

const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };
const threadFields = `t.id,t.initiator_id,t.recipient_id,t.member_status AS status,
  t.kind,t.name,t.avatar_path,t.created_at,t.updated_at`;
const profileFields = `'id',p.id,'username',p.username,'display_name',p.display_name,
  'avatar_url',p.avatar_url,'verified',json(CASE WHEN p.verified THEN 'true' ELSE 'false' END),
  'is_official',json(CASE WHEN p.is_official THEN 'true' ELSE 'false' END)`;
const messageFields = `m.id,m.sender_id,m.body_cipher,m.media_type,m.is_sticker,m.reply_to,
  m.created_at,m.read_at,m.edited_at,m.revoked_at`;

type Message = {
  id: string; sender_id: string; body_cipher: string; media_type: string | null;
  is_sticker: number; reply_to: string | null; created_at: string;
  read_at: string | null; edited_at: string | null; revoked_at: string | null;
};

export async function readD1Chat(db: NooklieD1, hash: string | null, request: Request) {
  const reply = (body: object, status = 200) => Response.json(body, { status, headers });
  const actor = hash ? await db.prepare(`SELECT a.profile_id,
    EXISTS(SELECT 1 FROM platform_admins p WHERE p.user_id = a.user_id) AS is_admin
    FROM d1_social_actors a WHERE a.token_hash = ?`)
    .bind(hash).first<{ profile_id: string; is_admin: number }>() : null;
  if (!actor) return reply({ error: 'Entre para abrir seu chat.' }, 401);
  const params = new URL(request.url).searchParams;
  const id = params.get('thread');
  if (!id) {
    const rows = await db.prepare(`SELECT ${threadFields},
      CASE WHEN p.id IS NULL THEN NULL ELSE json_object(${profileFields}) END AS peer
      FROM d1_chat_access t LEFT JOIN profiles p ON t.kind = 'direct'
        AND p.id = CASE WHEN t.initiator_id = t.actor_id THEN t.recipient_id ELSE t.initiator_id END
      WHERE t.token_hash = ? ORDER BY t.updated_at DESC, t.id LIMIT 100`)
      .bind(hash).all<{ peer: string | null }>();
    if (!rows.success) throw Error('Unable to list chat threads');
    return reply({ me: actor.profile_id, is_admin: Boolean(actor.is_admin),
      threads: rows.results.map(t => ({ ...t, peer: t.peer ? JSON.parse(t.peer) : null })) });
  }

  const thread = await db.prepare(`SELECT ${threadFields}, t.blocked,
    EXISTS(SELECT 1 FROM chat_blocks b WHERE b.blocker_id = t.actor_id AND (
      (t.kind = 'direct' AND b.blocked_id IN (t.initiator_id,t.recipient_id))
      OR (t.kind = 'group' AND EXISTS(SELECT 1 FROM chat_group_members g
        WHERE g.thread_id = t.id AND g.profile_id = b.blocked_id AND g.status = 'accepted'))
    )) AS blocked_by_me FROM d1_chat_access t WHERE t.token_hash = ? AND t.id = ?`)
    .bind(hash, id).first<{ kind: string; status: string; blocked: number; blocked_by_me: number }>();
  if (!thread) return new Response(null, { status: 404, headers });
  const summary = { ...thread, blocked: Boolean(thread.blocked), blocked_by_me: Boolean(thread.blocked_by_me) };
  if (summary.blocked || (thread.kind === 'group' && thread.status !== 'accepted')) {
    return reply({ me: actor.profile_id, thread: summary, messages: [] });
  }
  const before = params.get('before');
  if (before && !Number.isFinite(Date.parse(before))) return new Response(null, { status: 400, headers });
  const version = chatCipherVersion();
  const authorized = `FROM chat_messages m JOIN d1_chat_access t ON t.id = m.thread_id
    WHERE t.token_hash = ?1 AND t.id = ?2 AND m.cipher_version = ?3 AND t.blocked = 0
      AND (t.kind = 'direct' OR t.member_status = 'accepted')`;
  const page = await db.prepare(`SELECT ${messageFields} ${authorized}
    AND (?4 IS NULL OR julianday(m.created_at) < julianday(?4))
    ORDER BY m.created_at DESC,m.id DESC LIMIT 60`).bind(hash, id, version, before).all<Message>();
  if (!page.success) throw Error('Unable to list chat messages');
  const serialize = ({ body_cipher, is_sticker, ...m }: Message) => ({
    ...m, is_sticker: Boolean(is_sticker),
    body: decryptChat(decodeChatBody(body_cipher), `${id}:${m.id}:body`).toString('utf8'),
    media_url: m.media_type ? `/api/chat/media/${m.id}` : null,
  });
  const messages = page.results.reverse().map(serialize);
  const changes = [];
  const visibleSince = params.get('visible_since');
  const changedSince = params.get('changed_since');
  const oldest = messages[0]?.created_at;
  if (!before && visibleSince && changedSince && oldest &&
      Date.parse(visibleSince) < Date.parse(oldest) && Number.isFinite(Date.parse(changedSince))) {
    let after = '';
    for (;;) {
      const rows = await db.prepare(`SELECT ${messageFields} ${authorized}
        AND julianday(m.created_at) >= julianday(?4) AND julianday(m.created_at) < julianday(?5)
        AND (julianday(m.edited_at) >= julianday(?6) OR julianday(m.revoked_at) >= julianday(?6))
        AND m.id > ?7 ORDER BY m.id LIMIT 500`)
        .bind(hash, id, version, visibleSince, oldest, changedSince, after).all<Message>();
      if (!rows.success) throw Error('Unable to refresh chat messages');
      changes.push(...rows.results.map(serialize));
      if (rows.results.length < 500) break;
      after = rows.results[499].id;
    }
  }
  let members: unknown[] = [];
  if (thread.kind === 'direct') {
    const read = await db.prepare(`UPDATE chat_messages SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE thread_id = ?2 AND cipher_version = ?3 AND read_at IS NULL AND EXISTS (
        SELECT 1 FROM d1_chat_access t WHERE t.token_hash = ?1 AND t.id = ?2
          AND t.kind = 'direct' AND t.blocked = 0 AND t.actor_id <> chat_messages.sender_id
      )`).bind(hash, id, version).run();
    if (!read.success) throw Error('Unable to mark chat messages read');
  } else {
    const rows = await db.prepare(`SELECT g.profile_id,g.status,json_object(${profileFields}) AS profile
      FROM chat_group_members g JOIN profiles p ON p.id = g.profile_id
      JOIN d1_chat_access t ON t.id = g.thread_id
      WHERE t.token_hash = ? AND t.id = ? AND t.member_status = 'accepted' AND t.blocked = 0
      ORDER BY g.joined_at,g.profile_id`).bind(hash, id).all<{ profile: string }>();
    if (!rows.success) throw Error('Unable to list chat members');
    members = rows.results.map(m => ({ ...m, profile: JSON.parse(m.profile) }));
  }
  return reply({ me: actor.profile_id, thread: summary, messages, changes, members, has_more: messages.length === 60 });
}
