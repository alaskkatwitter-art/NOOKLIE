import { NextResponse } from 'next/server';
import sanitizeHtml from 'sanitize-html';
import { discoveryDb, getDiscoveryReader, privateHeaders, uuid } from '@/lib/discovery/server';

const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });
const validId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);

export async function GET(request: Request) {
  try {
    const actor = await getDiscoveryReader();
    if (!actor) return reply({ error: 'Entre para acessar a leitura beta.' }, 401);
    const invite = new URL(request.url).searchParams.get('invite');
    if (invite !== null && !validId(invite)) return reply({ error: 'Convite inválido.' }, 400);
    const { data, error } = await discoveryDb.rpc('beta_reading_action', {
      p_actor: actor.profile.id, p_action: invite ? 'read' : 'list', p_invite: invite,
    });
    if (error) throw error;
    if (data === null) return reply({ error: 'Este rascunho não está disponível para você.' }, 404);
    if (!invite) return reply({ invites: data });
    // The private preview shows text and formatting without external or draft media.
    return reply({ draft: { ...data, body: sanitizeHtml(data.body || '', {
      allowedTags: ['p', 'br', 'div', 'h2', 'h3', 'strong', 'em', 'u', 's', 'blockquote', 'ul', 'ol', 'li', 'hr'],
      allowedAttributes: {},
    }) } });
  } catch {
    return reply({ error: 'Não foi possível carregar a leitura beta.' }, 503);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await getDiscoveryReader();
    if (!actor) return reply({ error: 'Entre para usar a leitura beta.' }, 401);
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
