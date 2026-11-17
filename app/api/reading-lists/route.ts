import { chatActor, chatDb, privateHeaders, sameOrigin, uuid } from '@/lib/chat/server';
import { readingListImageUrl } from '@/lib/reading-lists/image';
import { getPublicProfileIds, isPublicStoryVisible } from '@/lib/moderation/content-visibility';

function respond(data: object, status = 200) {
  return Response.json(data, { status, headers: privateHeaders });
}

export async function GET(request: Request) {
  try {
    const actor = await chatActor();
    if (!actor) return respond({ error: 'Entre para acessar suas listas.' }, 401);
    const params = new URL(request.url).searchParams;
    const listId = params.get('id');
    const storyId = params.get('story');
    if ([listId, storyId].some(id => id && !uuid.test(id))) return respond({ error: 'Identificador inválido.' }, 400);

    let query = chatDb.from('reading_lists').select('id,name,description,is_public,image_path,reading_list_items(story_id,position,added_at)').eq('user_id', actor.profileId).neq('name', 'Biblioteca').order('created_at');
    if (listId) query = query.eq('id', listId);
    const { data, error } = await query;
    if (error) throw error;
    const lists = data.map(({ reading_list_items: items, image_path, ...list }) => ({
      ...list,
      image_url: readingListImageUrl(list.id, image_path),
      count: items.length,
      containsStory: items.some(item => item.story_id === storyId),
    }));
    if (!listId) return respond({ lists });
    if (!lists.length) return respond({ error: 'Lista indisponível.' }, 404);
    const ordered = [...data[0].reading_list_items].sort((a, b) => a.position - b.position ||
      Date.parse(b.added_at) - Date.parse(a.added_at) || a.story_id.localeCompare(b.story_id));
    const ids = ordered.map(item => item.story_id);
    if (!ids.length) return respond({ list: lists[0], stories: [], order: [] });
    const stories = await chatDb.from('released_stories').select('id,title,author_id,cover_url').in('id', ids);
    if (stories.error) throw stories.error;
    const authors = await getPublicProfileIds(chatDb, stories.data.map(story => story.author_id), actor.profileId);
    const visible = new Map(stories.data.filter(story => authors.has(story.author_id)).map(story => [story.id, story]));
    return respond({ list: lists[0], order: ids, stories: ids.flatMap(id => {
      const story = visible.get(id);
      return story ? [{ id, title: story.title, cover_url: story.cover_url }] : [];
    }) });
  } catch (error) {
    console.error('reading lists GET', error);
    return respond({ error: 'Não foi possível carregar as listas.' }, 500);
  }
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return respond({ error: 'Acesso restrito.' }, 403);
    const actor = await chatActor();
    if (!actor) return respond({ error: 'Entre para organizar suas listas.' }, 401);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return respond({ error: 'Dados inválidos.' }, 400);
    const { listId, storyId } = body;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if ([listId, storyId].some(id => id != null && (typeof id !== 'string' || !uuid.test(id)))) {
      return respond({ error: 'Identificador inválido.' }, 400);
    }
    if (listId && !storyId) return respond({ error: 'Escolha uma história.' }, 400);
    if (!listId && (!name || name.length > 80 || description.length > 240 || name.toLowerCase() === 'biblioteca')) {
      return respond({ error: 'Escolha um nome válido para a lista, com até 80 caracteres.' }, 400);
    }
    if (storyId && !(await isPublicStoryVisible(chatDb, storyId))) return respond({ error: 'História indisponível.' }, 404);

    const { data, error } = await chatDb.rpc('save_reading_list', {
      p_owner: actor.profileId,
      p_list: listId ?? null,
      p_story: storyId ?? null,
      p_name: name,
      p_description: description,
    });
    if (error) throw error;
    if (!data) return respond({ error: 'Lista indisponível.' }, 404);
    return respond({ id: data }, listId ? 200 : 201);
  } catch (error) {
    console.error('reading lists POST', error);
    return respond({ error: 'Não foi possível salvar sua lista.' }, 500);
  }
}

export async function DELETE(request: Request) {
  try {
    if (!sameOrigin(request)) return respond({ error: 'Acesso restrito.' }, 403);
    const actor = await chatActor();
    if (!actor) return respond({ error: 'Entre para organizar suas listas.' }, 401);
    const { listId, storyId } = await request.json().catch(() => ({})) ?? {};
    if ([listId, storyId].some(id => typeof id !== 'string' || !uuid.test(id))) {
      return respond({ error: 'Identificador inválido.' }, 400);
    }
    const result = await chatDb.rpc('remove_reading_list_item', {
      p_owner: actor.profileId, p_list: listId, p_story: storyId,
    });
    if (result.error) throw result.error;
    if (!result.data) return respond({ error: 'Lista indisponível.' }, 404);
    return respond({ removed: true });
  } catch (error) {
    console.error('reading lists DELETE', error);
    return respond({ error: 'Não foi possível retirar a história da lista.' }, 500);
  }
}


export async function PATCH(request: Request) {
  try {
    if (!sameOrigin(request)) return respond({ error: 'Acesso restrito.' }, 403);
    const actor = await chatActor();
    if (!actor) return respond({ error: 'Entre para organizar suas listas.' }, 401);
    const raw = await request.text();
    const body = raw.length <= 200_000 ? await new Response(raw).json().catch(() => null) : null;
    if (typeof body?.listId !== 'string' || !uuid.test(body.listId)) return respond({ error: 'Lista inválida.' }, 400);
    if (body.action === 'reorder') {
      if (!Array.isArray(body.ids) || body.ids.length > 5000 ||
          !body.ids.every((id: unknown) => typeof id === 'string' && uuid.test(id))) {
        return respond({ error: 'Ordem inválida.' }, 400);
      }
      const result = await chatDb.rpc('reorder_reading_list', {
        p_owner: actor.profileId, p_list: body.listId, p_stories: body.ids,
      });
      if (result.error) return respond({ error: 'A lista mudou. Atualize a página antes de reorganizar.' }, 409);
      if (!result.data) return respond({ error: 'Lista indisponível.' }, 404);
      return respond({ saved: true });
    }
    if (body.action === 'visibility' && typeof body.is_public === 'boolean') {
      const result = await chatDb.from('reading_lists').update({ is_public: body.is_public })
        .eq('id', body.listId).eq('user_id', actor.profileId).neq('name', 'Biblioteca').select('id').maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return respond({ error: 'Lista indisponível.' }, 404);
      return respond({ saved: true });
    }
    return respond({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    console.error('reading lists PATCH', error);
    return respond({ error: 'Não foi possível atualizar sua lista.' }, 500);
  }
}
