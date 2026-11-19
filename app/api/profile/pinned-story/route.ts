import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1Books } from '@/lib/database/d1-books';
import { safeChapterHtml } from '@/lib/security/html';
import { NextResponse } from 'next/server';
import { discoveryDb, getDiscoveryReader, privateHeaders, uuid } from '@/lib/discovery/server';

export async function PUT(request: Request) {
  const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });
  try {
    const db = getD1PreviewDatabase('auth');
    const auth = db ? await getAuthenticatedUserContext() : null;
    const actor = db ? null : await getDiscoveryReader();
    if (!actor && !auth) return reply({ error: 'Entre para editar seu perfil.' }, 401);

    const body = await request.json().catch(() => null);
    const storyId: unknown = body?.story_id;
    if (storyId !== null && (typeof storyId !== 'string' || !uuid.test(storyId))) {
      return reply({ error: 'Escolha uma obra válida.' }, 400);
    }

    if (db && auth) {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) return reply({error:'Origem não permitida.'},403);
      const pinned = await d1Books(db,safeChapterHtml).pinStory(auth.sessionTokenHash,storyId);
      return pinned ? reply({pinned_story_id:storyId})
        : reply({error:'Escolha uma obra sua com pelo menos um capítulo publicado.'},404);
    }
    if (!actor) return reply({error:'Entre para editar seu perfil.'},401);
    const { data, error } = await discoveryDb.rpc('pin_profile_story', {
      p_profile: actor.profile.id,
      p_story: storyId,
    });
    if (error) throw error;
    if (!data) return reply({ error: 'Escolha uma obra sua com pelo menos um capítulo publicado.' }, 404);
    return reply({ pinned_story_id: storyId });
  } catch {
    return reply({ error: 'Não foi possível atualizar o destaque.' }, 503);
  }
}
