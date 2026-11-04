import { NextResponse } from 'next/server';
import { discoveryDb, getDiscoveryReader, privateHeaders, uuid } from '@/lib/discovery/server';

export async function PUT(request: Request) {
  const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });
  try {
    const actor = await getDiscoveryReader();
    if (!actor) return reply({ error: 'Entre para editar seu perfil.' }, 401);

    const body = await request.json().catch(() => null);
    const storyId: unknown = body?.story_id;
    if (storyId !== null && (typeof storyId !== 'string' || !uuid.test(storyId))) {
      return reply({ error: 'Escolha uma obra válida.' }, 400);
    }

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
