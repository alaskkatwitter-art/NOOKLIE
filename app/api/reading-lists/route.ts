import { chatActor, chatDb, privateHeaders, uuid } from '@/lib/chat/server';
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

    let query = chatDb.from('reading_lists').select('id,name,description,reading_list_items(story_id)').eq('user_id', actor.profileId).neq('name', 'Biblioteca').order('created_at');
    if (listId) query = query.eq('id', listId);
    const { data, error } = await query;
    if (error) throw error;
    const lists = data.map(({ reading_list_items: items, ...list }) => ({
      ...list,
      count: items.length,
      containsStory: items.some(item => item.story_id === storyId),
    }));
    if (!listId) return respond({ lists });
    if (!lists.length) return respond({ error: 'Lista indisponível.' }, 404);
    const ids = data[0].reading_list_items.map(item => item.story_id);
    if (!ids.length) return respond({ list: lists[0], stories: [] });
    const stories = await chatDb.from('released_stories').select('id,title,author_id').in('id', ids);
    if (stories.error) throw stories.error;
    const authors = await getPublicProfileIds(chatDb, stories.data.map(story => story.author_id), actor.profileId);
    return respond({ list: lists[0], stories: stories.data.filter(story => authors.has(story.author_id)).map(({ id, title }) => ({ id, title })) });
  } catch (error) {
    console.error('reading lists GET', error);
    return respond({ error: 'Não foi possível carregar as listas.' }, 500);
  }
}

export async function POST(request: Request) {
  try {
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
