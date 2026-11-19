import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1FollowActor } from '@/lib/database/d1-follow-http';
import { d1Beta } from '@/lib/database/d1-beta';
import { NextResponse } from 'next/server';
import sanitizeHtml from 'sanitize-html';
import { discoveryDb, getDiscoveryReader, privateHeaders, uuid } from '@/lib/discovery/server';

const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });
const validId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);

const sanitizeBeta = (html: string) => sanitizeHtml(html, {
  allowedTags: ['p', 'br', 'div', 'h2', 'h3', 'strong', 'em', 'u', 's', 'blockquote', 'ul', 'ol', 'li', 'hr'],
  allowedAttributes: {},
});

export async function GET(request: Request) {
  try {
    const db = getD1PreviewDatabase('auth');
    const d1Actor = db ? await d1FollowActor(db) : null;
    const actor = db ? null : await getDiscoveryReader();
    if (!actor && !d1Actor) return reply({ error: 'Entre para acessar a leitura beta.' }, 401);
    const invite = new URL(request.url).searchParams.get('invite');
    if (invite !== null && !validId(invite)) return reply({ error: 'Convite inválido.' }, 400);
    if (db && d1Actor) {
      const beta = d1Beta(db, sanitizeBeta);
      if (!invite) return reply({ invites: await beta.invites(d1Actor.hash) });
      const draft = await beta.read(d1Actor.hash, invite.toLowerCase());
      return draft ? reply({ draft }) : reply({ error: 'Este rascunho não está disponível para você.' }, 404);
    }
    if (!actor) return reply({ error: 'Entre para acessar a leitura beta.' }, 401);
    const { data, error } = await discoveryDb.rpc('beta_reading_action', {
      p_actor: actor.profile.id, p_action: invite ? 'read' : 'list', p_invite: invite,
    });
    if (error) throw error;
    if (data === null) return reply({ error: 'Este rascunho não está disponível para você.' }, 404);
    if (!invite) return reply({ invites: data });
    // The private preview shows text and formatting without external or draft media.
    return reply({ draft: { ...data, body: sanitizeBeta(data.body || '') } });
  } catch {
    return reply({ error: 'Não foi possível carregar a leitura beta.' }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const db = getD1PreviewDatabase('auth');
    const d1Actor = db ? await d1FollowActor(db) : null;
    const actor = db ? null : await getDiscoveryReader();
    if (!actor && !d1Actor) return reply({ error: 'Entre para usar a leitura beta.' }, 401);
    const body = await request.json().catch(() => null);
    const action = body?.action;
    const invite: unknown = body?.invite_id;
    const chapter: unknown = body?.chapter_id;
    const reader = typeof body?.reader === 'string' ? body.reader.trim().replace(/^@/, '') : '';
    const excerpt = typeof body?.excerpt === 'string' ? body.excerpt.trim() : '';
    const note = typeof body?.body === 'string' ? body.body.trim() : '';
    if (
      !['invite', 'accept', 'revoke', 'note'].includes(action) ||
      (action === 'invite' ? !validId(chapter) || !reader || reader.length > 50 : !validId(invite)) ||
      (action === 'note' && (!note || note.length > 2000 || excerpt.length > 400))
    ) return reply({ error: 'Confira os dados e tente novamente.' }, 400);
    if (db && d1Actor) {
      const beta = d1Beta(db, sanitizeBeta);
      const hash = d1Actor.hash;
      if (action === 'invite' && validId(chapter)) {
        if (await beta.invite(hash, crypto.randomUUID(), chapter.toLowerCase(), reader)) return reply({ ok: true });
        return reply({ error: 'Confira o nome de usuário e se o capítulo é um rascunho de uma obra original sua.' }, 404);
      }
      if (validId(invite)) {
        const id = invite.toLowerCase();
        const result = action === 'accept' ? await beta.accept(hash, id)
          : action === 'revoke' ? await beta.revoke(hash, id)
          : await beta.note(hash, crypto.randomUUID(), id, excerpt, note);
        if (result) return reply({ ok: true });
      }
      return reply({ error: 'Este convite ou rascunho não está disponível.' }, 404);
    }
    if (!actor) return reply({ error: 'Entre para usar a leitura beta.' }, 401);
    const { data, error } = await discoveryDb.rpc('beta_reading_action', {
      p_actor: actor.profile.id, p_action: action,
      p_invite: validId(invite) ? invite : null,
      p_chapter: validId(chapter) ? chapter : null,
      p_reader: reader, p_excerpt: excerpt, p_body: note,
    });
    if (error) throw error;
    if (!data) return reply({ error: action === 'invite' ? 'Confira o nome de usuário e se o capítulo é um rascunho de uma obra original sua.' : 'Este convite ou rascunho não está disponível.' }, 404);
    return reply({ ok: true });
  } catch {
    return reply({ error: 'Não foi possível concluir esta ação.' }, 503);
  }
}
