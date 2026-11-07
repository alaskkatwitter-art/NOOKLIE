import { chatActor, chatDb, privateHeaders, uuid } from '@/lib/chat/server';
import { getStaffContext, hasStaffPermission } from '@/lib/admin/authorization';

const respond = (data: object, status = 200) => Response.json(data, { status, headers: privateHeaders });

async function canReview() {
  const staff = await getStaffContext();
  return staff && (staff.isPlatformAdmin || await hasStaffPermission(staff, 'moderation.manage'));
}

export async function GET(request: Request) {
  try {
    const actor = await chatActor();
    const params = new URL(request.url).searchParams;
    const id = params.get('id');
    if (id && !uuid.test(id)) return respond({ error: 'Personagem indisponível.' }, 404);
    if (params.get('pending') === '1') {
      if (!await canReview()) return respond({ error: 'Acesso à revisão restrito à equipe.' }, 403);
      const pending = await chatDb.from('wiki_character_edits').select('id,biography,source_url,wiki_characters(name,universe)').is('decision', null).order('created_at').limit(60);
      if (pending.error) throw pending.error;
      return respond({ edits: pending.data });
    }
    const favoriteQuery = actor ? chatDb.from('wiki_character_favorites').select('character_id,wiki_characters(id,name,universe,approved_at)').eq('profile_id', actor.profileId)
      : Promise.resolve({ data: [], error: null });
    const fields = 'id,name,universe,biography,source_url,approved_at';
    let query = chatDb.from('wiki_characters').select(fields).not('approved_at', 'is', null).order('name').limit(60);
    if (id) query = query.eq('id', id);
    const name = params.get('q')?.trim().slice(0, 100);
    if (name && !id) query = query.ilike('name', '%' + name.replace(/[\\%_]/g, '\\$&') + '%');
    const [characters, favorites] = await Promise.all([query, favoriteQuery]);
    if (characters.error || favorites.error) throw characters.error || favorites.error;
    const favorite = favorites.data.find(row => row.character_id === id);
    if (id && !characters.data.length && !favorite) return respond({ error: 'Personagem indisponível.' }, 404);
    return respond({
      authenticated: Boolean(actor),
      characters: characters.data,
      favorites: favorites.data.map(row => row.wiki_characters).flat(),
      canReview: !id && Boolean(actor && await canReview()),
    });
  } catch (error) {
    console.error('characters GET', error);
    return respond({ error: 'Não foi possível carregar os personagens.' }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await chatActor();
    if (!actor) return respond({ error: 'Entre para participar da wiki.' }, 401);
    const body = await request.json().catch(() => null);
    if (!body || (body.id != null && (typeof body.id !== 'string' || !uuid.test(body.id)))) {
      return respond({ error: 'Dados inválidos.' }, 400);
    }
    if (body.action === 'review') {
      if (!await canReview()) return respond({ error: 'Revisão restrita à equipe.' }, 403);
      if (!body.id || !['approved', 'rejected'].includes(body.decision)) return respond({ error: 'Decisão inválida.' }, 400);
      const reviewed = await chatDb.rpc('review_character_edit', { p_edit: body.id, p_decision: body.decision });
      if (reviewed.error) throw reviewed.error;
      return reviewed.data ? respond({ ok: true }) : respond({ error: 'Sugestão já revisada ou indisponível.' }, 409);
    }
    if (body.action === 'favorite') {
      if (!body.id || typeof body.enabled !== 'boolean') return respond({ error: 'Dados inválidos.' }, 400);
      if (body.enabled) {
        const character = await chatDb.from('wiki_characters').select('id').eq('id', body.id).not('approved_at', 'is', null).maybeSingle();
        if (character.error) throw character.error;
        if (!character.data) return respond({ error: 'Personagem indisponível.' }, 404);
        const favorite = await chatDb.from('wiki_character_favorites').upsert({ profile_id: actor.profileId, character_id: body.id }, { onConflict: 'profile_id,character_id', ignoreDuplicates: true });
        if (favorite.error) throw favorite.error;
      } else {
        const favorite = await chatDb.from('wiki_character_favorites').delete().eq('profile_id', actor.profileId).eq('character_id', body.id);
        if (favorite.error) throw favorite.error;
      }
      return respond({ ok: true });
    }
    if (body.action !== 'submit') return respond({ error: 'Ação inválida.' }, 400);
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    const universe = typeof body.universe === 'string' ? body.universe.trim().replace(/\s+/g, ' ') : '';
    const biography = typeof body.biography === 'string' ? body.biography.trim() : '';
    const source = typeof body.source === 'string' && body.source.length <= 1500 ? URL.parse(body.source.trim()) : null;
    if ((!body.id && (name.length < 2 || name.length > 100 || universe.length < 2 || universe.length > 160)) ||
        biography.length < 20 || biography.length > 5000 || !source || source.protocol !== 'https:' || source.username || source.password) {
      return respond({ error: 'Informe os dados do personagem, uma descrição de 20 a 5.000 caracteres e uma fonte HTTPS verificável.' }, 400);
    }
    const result = await chatDb.rpc('submit_character_edit', { p_profile: actor.profileId, p_character: body.id || null, p_name: name, p_universe: universe, p_bio: biography, p_source: source.href });
    if (result.error) throw result.error;
    return result.data ? respond({ id: result.data }, 201) : respond({ error: body.id ? 'Adicione o personagem aos favoritos para contribuir.' : 'Esse personagem já está cadastrado nesse universo.' }, 409);
  } catch (error) {
    console.error('characters POST', error);
    return respond({ error: 'Não foi possível salvar a alteração.' }, 500);
  }
}
