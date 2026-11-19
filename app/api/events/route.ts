import { getD1PreviewDatabase } from '@/lib/database/preview';
import { getSessionTokenHash } from '@/lib/auth/session';
import { getMediaBucket, getHistoricalMediaBucket } from '@/lib/media/r2-binding';
import type { NooklieD1 } from '@/lib/database/d1';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { sameOrigin } from '@/lib/chat/server';
import { discoveryDb, getDiscoveryReader, privateHeaders, uuid } from '@/lib/discovery/server';
import { getStaffContext } from '@/lib/admin/authorization';
import { mediaStorage } from '@/lib/media/storage';
import { imageMatchesType } from '@/lib/security/uploads';
import {
  eventDataBytes, eventEligibility, eventEntryLimits, eventFormats, eventImageBytes,
  eventImageTypes, eventMaxImages, eventMaxTopics, eventTextLimit, eventTopicLimit,
  type EventDetails, type EventImage, type LiteraryEvent,
} from '@/lib/discovery/events';

const fields = 'id,title,description,starts_at,ends_at,active,details,revision';
const maxFormBytes = eventMaxImages * eventImageBytes + eventDataBytes + 32_768;
const storage = () => mediaStorage(discoveryDb, 'chapter-media');
const publicEvent = "active=1 AND julianday(ends_at)>julianday('now')";
type EventRow = Omit<LiteraryEvent, 'active' | 'details'> & { active: number; details: string | null };
function eventFromRow(row: EventRow): LiteraryEvent {
  return { ...row, active: Boolean(row.active), details: row.details ? JSON.parse(row.details) : null };
}
async function d1EventActor(db: NooklieD1) {
  const hash = await getSessionTokenHash();
  if (!hash) return null;
  return db.prepare(`SELECT a.user_id AS accountId,a.profile_id AS profileId,
    a.token_hash AS hash,EXISTS(SELECT 1 FROM platform_admins p WHERE p.user_id=a.user_id) AS admin
    FROM d1_social_actors a WHERE a.token_hash=?`).bind(hash)
    .first<{ accountId: string; profileId: string; hash: string; admin: number }>();
}

const adminCheck = `EXISTS(SELECT 1 FROM d1_social_actors a JOIN platform_admins p ON p.user_id=a.user_id
  WHERE a.token_hash=?1)`;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: privateHeaders });
}

function problem(error: string, status = 400) {
  return json({ error }, status);
}

function visibleEvents(canManage: boolean) {
  const query = discoveryDb.from('story_events').select(fields);
  if (canManage) return query;
  const now = new Date().toISOString();
  return query.eq('active', true).gt('ends_at', now);
}

function imagePath(eventId: string, image: EventImage) {
  return 'events/' + eventId + '/' + image.id + '.' + eventImageTypes[image.type];
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const db = getD1PreviewDatabase('auth');
    if (db) {
      if (params.get('destaque') === '1') {
        const event = await db.prepare(`SELECT id,title FROM story_events WHERE ${publicEvent}
          ORDER BY julianday(starts_at),id LIMIT 1`).first<{ id: string; title: string }>();
        return json({ event });
      }
      const actor = await d1EventActor(db);
      const canManage = Boolean(actor?.admin);
      const imageId = params.get('image');
      const eventId = params.get(imageId === null ? 'evento' : 'event') || null;
      if (imageId !== null && (!eventId || !uuid.test(eventId) || !uuid.test(imageId))) {
        return problem('Imagem não encontrada.',404);
      }
      if (eventId && !uuid.test(eventId)) return problem('Evento inválido.',400);
      const result = await db.prepare(`SELECT ${fields} FROM story_events
        WHERE (?1=1 OR (${publicEvent})) AND (?2 IS NULL OR id=?2)
        ORDER BY julianday(starts_at) DESC,id LIMIT 50`)
        .bind(Number(canManage),eventId?.toLowerCase() ?? null).all<EventRow>();
      if (!result.success) throw Error('Events unavailable');
      const events = result.results.map(eventFromRow);
      if (imageId === null) return json({ events, can_manage: canManage });
      const image = events[0]?.details?.images.find(item => item.id === imageId.toLowerCase());
      if (!image) return problem('Imagem não encontrada.',404);
      const key = 'chapter-media/' + imagePath(events[0].id,image);
      const object = await getMediaBucket()?.get(key) ?? await getHistoricalMediaBucket()?.get(key);
      if (!object) return problem('Não foi possível carregar a imagem.',503);
      return new Response(object.body,{
        headers: { ...privateHeaders, 'Content-Type': image.type, 'X-Content-Type-Options': 'nosniff' },
      });
    }
    if (params.get('destaque') === '1') {
      const { data, error } = await discoveryDb.from('story_events').select('id,title')
        .eq('active', true).gt('ends_at', new Date().toISOString()).order('starts_at').limit(1).maybeSingle();
      if (error) throw error;
      return json({ event: data });
    }
    const [staff, reader] = await Promise.all([getStaffContext(), getDiscoveryReader()]);
    const canManage = Boolean(reader && staff?.isPlatformAdmin);
    const imageId = params.get('image');
    if (imageId !== null) {
      const eventId = params.get('event') || '';
      if (!uuid.test(eventId) || !uuid.test(imageId)) return problem('Imagem não encontrada.', 404);
      const row = await visibleEvents(canManage).eq('id', eventId).maybeSingle();
      if (row.error) throw row.error;
      const event = row.data as LiteraryEvent | null;
      const image = event?.details?.images.find(item => item.id === imageId);
      if (!image) return problem('Imagem não encontrada.', 404);
      const result = await storage().download(imagePath(eventId, image));
      if (result.error) return problem('Não foi possível carregar a imagem.', 503);
      return new Response(result.data, {
        headers: { ...privateHeaders, 'Content-Type': image.type, 'X-Content-Type-Options': 'nosniff' },
      });
    }
    const eventId = params.get('evento');
    if (eventId && !uuid.test(eventId)) return problem('Evento inválido.', 400);
    const query = visibleEvents(canManage);
    if (eventId) query.eq('id', eventId);
    const { data, error } = await query.order('starts_at', { ascending: false }).limit(50);
    if (error) throw error;
    return json({ events: data || [], can_manage: canManage });
  } catch {
    return problem('Não foi possível carregar os eventos.', 503);
  }
}

function parseJson(text: string, limit: number) {
  try {
    const body: unknown = text.length <= limit ? JSON.parse(text) : null;
    return isObject(body) ? body : null;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function validText(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.length <= limit && !value.includes('\0');
}

function validOption(value: unknown, choices: string[]): value is string {
  return value === '' || (typeof value === 'string' && choices.includes(value));
}

async function removeImages(paths: string[]) {
  if (paths.length) {
    const result = await storage().remove(paths);
    if (result.error) console.error('Não foi possível limpar imagens de evento.', result.error);
  }
}

async function saveEvent(request: Request, accountId: string, editing: boolean,
  db?: NooklieD1, actor?: NonNullable<Awaited<ReturnType<typeof d1EventActor>>>) {
  const canManage = db ? Boolean(actor?.admin) : Boolean((await getStaffContext())?.isPlatformAdmin);
  if (!canManage) return problem('Apenas a administração pode gerenciar eventos.', 403);
  if (Number(request.headers.get('content-length')) > maxFormBytes) {
    return problem('As imagens excedem o tamanho permitido.', 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return problem('Não foi possível ler o formulário.');
  }
  const raw = form.get('event');
  const body = typeof raw === 'string' ? parseJson(raw, eventDataBytes) : null;
  if (!body || typeof body.id !== 'string' || !uuid.test(body.id) ||
      !validText(body.title, 120) || !body.title.trim() ||
      !validText(body.description, eventTextLimit) ||
      typeof body.starts_at !== 'string' || typeof body.ends_at !== 'string') {
    return problem('Confira o título, a descrição e o período do evento.');
  }
  const eventId = body.id.toLowerCase();
  const starts = Date.parse(body.starts_at);
  const ends = Date.parse(body.ends_at);
  if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) {
    return problem('O encerramento deve ser posterior ao início.');
  }
  const details = body.details;
  if (!isObject(details) || !validOption(details.format, eventFormats) ||
      !validOption(details.eligibility, eventEligibility) ||
      !validOption(details.entry_limit, eventEntryLimits) ||
      !validText(details.instructions, eventTextLimit) || !validText(details.rules, eventTextLimit) ||
      !Array.isArray(details.topics) || details.topics.length > eventMaxTopics ||
      !Array.isArray(details.images) || details.images.length > eventMaxImages) {
    return problem('Confira as seções e imagens do evento.');
  }
  const topics = [];
  for (const topic of details.topics as unknown[]) {
    if (!isObject(topic) || !validText(topic.title, 100) || !topic.title.trim() ||
        !validText(topic.text, eventTopicLimit) || !topic.text.trim()) {
      return problem('Preencha o título e o texto dos tópicos extras.');
    }
    topics.push({ title: topic.title.trim(), text: topic.text.trim() });
  }

  let stored: { data: { created_by: string | null; details: EventDetails | null; revision: string } | null };
  if (db) {
    const row = await db.prepare('SELECT created_by,details,revision FROM story_events WHERE id=?').bind(eventId)
      .first<{created_by: string | null; details: string | null; revision: string}>();
    stored = { data: row ? { ...row, details: row.details ? JSON.parse(row.details) : null } : null };
  } else {
    const result = await discoveryDb.from('story_events').select('created_by,details,revision').eq('id', eventId).maybeSingle();
    if (result.error) throw result.error;
    stored = result;
  }
  if (editing && !stored.data) return problem('Evento não encontrado.', 404);
  if (editing && body.revision !== stored.data?.revision) {
    return problem('O evento mudou em outra aba. Abra a edição novamente para carregar a versão atual.', 409);
  }
  if (!editing && stored.data) {
    return stored.data.created_by === accountId ? json({ saved: true }, 201) : problem('Evento já existente.', 409);
  }

  const previous = (stored.data?.details as EventDetails | null)?.images ?? [];
  const images: EventImage[] = [];
  const newFiles: { image: EventImage; bytes: Uint8Array }[] = [];
  for (const [index, item] of (details.images as unknown[]).entries()) {
    if (!isObject(item) || !validText(item.alt, 200)) return problem('Confira a descrição das imagens.');
    const upload = form.get('image-' + index);
    if (typeof item.id === 'string') {
      const saved = previous.find(image => image.id === item.id);
      if (!saved || upload !== null || images.some(image => image.id === saved.id)) {
        return problem('Uma das imagens não está mais disponível.');
      }
      images.push({ ...saved, alt: item.alt.trim() });
      continue;
    }
    if (!(upload instanceof File) || !upload.size || upload.size > eventImageBytes) {
      return problem('Cada imagem deve ter até 3 MB.');
    }
    const bytes = new Uint8Array(await upload.arrayBuffer());
    if (!Object.hasOwn(eventImageTypes, upload.type) || !imageMatchesType(bytes, upload.type)) {
      return problem('Envie uma imagem JPG, PNG ou WebP válida.', 415);
    }
    const image = { id: randomUUID(), type: upload.type, alt: item.alt.trim() };
    images.push(image);
    newFiles.push({ image, bytes });
  }

  const revision = randomUUID();
  const values = {
    title: body.title.trim(),
    description: body.description.trim(),
    starts_at: new Date(starts).toISOString(),
    ends_at: new Date(ends).toISOString(),
    revision,
    details: {
      format: details.format,
      eligibility: details.eligibility,
      entry_limit: details.entry_limit,
      instructions: details.instructions.trim(),
      rules: details.rules.trim(),
      topics,
      images,
    },
  };
  if (db && actor) {
    const bucket = getMediaBucket();
    if (newFiles.length && !bucket) return problem('Não foi possível enviar as imagens. Tente novamente.',503);
    const uploaded: string[] = [];
    let committed = false;
    try {
      for (const { image, bytes } of newFiles) {
        const key = 'chapter-media/' + imagePath(eventId,image);
        const written = await bucket!.put(key,bytes,{ onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:image.type} });
        if (!written) throw Error('Event upload failed');
        uploaded.push(key);
      }
      const payload = [values.title,values.description,values.starts_at,values.ends_at,revision,JSON.stringify(values.details)];
      const statement = editing
        ? db.prepare(`UPDATE story_events SET title=?3,description=?4,starts_at=?5,ends_at=?6,revision=?7,details=?8
            WHERE id=?2 AND revision=?9 AND ${adminCheck} RETURNING id`)
            .bind(actor.hash,eventId,...payload,stored.data?.revision ?? '')
        : db.prepare(`INSERT INTO story_events(id,title,description,starts_at,ends_at,revision,details,created_by)
            SELECT ?2,?3,?4,?5,?6,?7,?8,a.user_id FROM d1_social_actors a
            WHERE a.token_hash=?1 AND ${adminCheck} ON CONFLICT(id) DO NOTHING RETURNING id`)
            .bind(actor.hash,eventId,...payload);
      const row = await statement.first<{ id: string }>();
      if (!row) return problem('O evento mudou em outra aba. Abra a edição novamente.',409);
      committed = true;
    } catch (error) {
      const current = await db.prepare('SELECT revision FROM story_events WHERE id=?').bind(eventId)
        .first<{ revision: string }>().catch(() => undefined);
      if (current === undefined) {
        uploaded.length = 0;
        throw error;
      }
      if (current?.revision !== revision) throw error;
      committed = true;
    } finally {
      if (!committed && uploaded.length) await bucket?.delete(uploaded).catch(() => undefined);
    }
    const obsolete = previous.filter(image => !images.some(next => next.id === image.id))
      .map(image => 'chapter-media/' + imagePath(eventId,image));
    if (obsolete.length) await bucket?.delete(obsolete).catch(() => undefined);
    return json({ saved: true }, editing ? 200 : 201);
  }

  const uploaded: string[] = [];
  for (const { image, bytes } of newFiles) {
    const path = imagePath(eventId, image);
    const upload = await storage().upload(path, bytes, { contentType: image.type, upsert: false });
    if (upload.error) {
      await removeImages(uploaded);
      return problem('Não foi possível enviar as imagens. Tente novamente.', 503);
    }
    uploaded.push(path);
  }

  const table = discoveryDb.from('story_events');
  const write = editing
    ? table.update(values).eq('id', eventId).eq('revision', stored.data?.revision ?? '')
    : table.insert({ ...values, id: eventId, created_by: accountId });
  const saved = await write.select('id').maybeSingle();
  if (saved.error) {
    // Confirm the write before deleting uploaded files after a failed response.
    const current = await discoveryDb.from('story_events').select('revision').eq('id', eventId).maybeSingle();
    if (current.error) throw saved.error;
    if (current.data?.revision !== revision) {
      await removeImages(uploaded);
      if (!editing && saved.error.code === '23505') return problem('O evento já foi publicado. Atualize a página.', 409);
      throw saved.error;
    }
  } else if (!saved.data) {
    await removeImages(uploaded);
    return problem('O evento mudou em outra aba. Abra a edição novamente.', 409);
  }

  await removeImages(previous.filter(image => !images.some(next => next.id === image.id))
    .map(image => imagePath(eventId, image)));
  return json({ saved: true }, editing ? 200 : 201);
}

export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return problem('Acesso restrito.', 403);
    const db = getD1PreviewDatabase('auth');
    const actor = db ? await d1EventActor(db) : null;
    const reader = db ? null : await getDiscoveryReader();
    const accountId = actor?.accountId ?? reader?.accountId;
    if (!accountId) return problem('Entre na sua conta.', 401);
    if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      return await saveEvent(request, accountId, false, db, actor ?? undefined);
    }
    const body = parseJson(await request.text(), 5000);
    if (!body) return problem('Dados inválidos.');
    if (body.action === 'enter') {
      if(typeof body.event_id!=='string'||!uuid.test(body.event_id)||typeof body.story_id!=='string'||!uuid.test(body.story_id))return NextResponse.json({error:'Selecione o evento e uma obra sua.'},{status:400,headers:privateHeaders});
      if (db && actor) {
        const result = await db.prepare(`INSERT INTO story_event_entries(event_id,story_id)
          SELECT e.id,s.id FROM story_events e JOIN released_stories s ON s.id=?3
          JOIN d1_social_actors a ON a.profile_id=s.author_id AND a.token_hash=?1
          WHERE e.id=?2 AND e.active=1 AND julianday(e.starts_at)<=julianday('now')
          AND julianday(e.ends_at)>julianday('now')
          ON CONFLICT(event_id,story_id) DO UPDATE SET story_id=excluded.story_id RETURNING story_id`)
          .bind(actor.hash,body.event_id.toLowerCase(),body.story_id.toLowerCase()).first();
        return result ? json({saved:true}) : problem('Evento indisponível ou obra não pertence a esta conta.',403);
      }
      if (!reader) return problem('Entre na sua conta.',401);
      const now=new Date().toISOString();
      const [event,story]=await Promise.all([
        discoveryDb.from('story_events').select('id').eq('id',body.event_id).eq('active',true).lte('starts_at',now).gt('ends_at',now).maybeSingle(),
        discoveryDb.from('released_stories').select('id').eq('id',body.story_id).eq('author_id',reader.profile.id).is('moderation_hidden_at',null).maybeSingle(),
      ]);
      if(event.error||story.error)throw event.error||story.error;
      if(!event.data||!story.data)return NextResponse.json({error:'Evento indisponível ou obra não pertence a esta conta.'},{status:403,headers:privateHeaders});
      const chapters=await discoveryDb.from('chapters').select('id').eq('story_id',body.story_id).eq('published',true).limit(1);
      if(chapters.error)throw chapters.error;
      if(!chapters.data?.length)return NextResponse.json({error:'Publique ao menos um capítulo antes de inscrever a obra.'},{status:400,headers:privateHeaders});
      const {error}=await discoveryDb.from('story_event_entries').upsert({event_id:body.event_id,story_id:body.story_id},{onConflict:'event_id,story_id',ignoreDuplicates:true});if(error)throw error;
      return NextResponse.json({saved:true},{headers:privateHeaders});
    }
    if (body.action !== 'create') return problem('Ação inválida.');
    if (!(db ? actor?.admin : (await getStaffContext())?.isPlatformAdmin)) return problem('Apenas a administração pode criar eventos.', 403);
    if (!validText(body.title, 120) || !body.title.trim() || !validText(body.description, 2000) ||
        typeof body.starts_at !== 'string' || typeof body.ends_at !== 'string') {
      return problem('Confira o título, a descrição e o período do evento.');
    }
    const starts = Date.parse(body.starts_at);
    const ends = Date.parse(body.ends_at);
    if (!Number.isFinite(starts) || !Number.isFinite(ends) || ends <= starts) {
      return problem('O encerramento deve ser posterior ao início.');
    }
    if (db && actor) {
      const created = await db.prepare(`INSERT INTO story_events(id,title,description,created_by,starts_at,ends_at,revision)
        SELECT ?2,?3,?4,a.user_id,?5,?6,?7 FROM d1_social_actors a WHERE a.token_hash=?1 AND ${adminCheck}
        RETURNING id`).bind(actor.hash,randomUUID(),body.title.trim(),body.description.trim(),
          new Date(starts).toISOString(),new Date(ends).toISOString(),randomUUID()).first();
      return created ? json({saved:true},201) : problem('Apenas a administração pode criar eventos.',403);
    }
    const { error } = await discoveryDb.from('story_events').insert({
      title: body.title.trim(), description: body.description.trim(), created_by: accountId,
      starts_at: new Date(starts).toISOString(), ends_at: new Date(ends).toISOString(),
    });
    if (error) throw error;
    return json({ saved: true }, 201);
  } catch {
    return problem('Não foi possível concluir a operação.', 503);
  }
}

export async function PATCH(request: Request) {
  try {
    if (!sameOrigin(request)) return problem('Acesso restrito.', 403);
    const db = getD1PreviewDatabase('auth');
    const actor = db ? await d1EventActor(db) : null;
    const reader = db ? null : await getDiscoveryReader();
    const accountId = actor?.accountId ?? reader?.accountId;
    if (!accountId) return problem('Entre na sua conta.', 401);
    if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      return await saveEvent(request, accountId, true, db, actor ?? undefined);
    }
    if (!(db ? actor?.admin : (await getStaffContext())?.isPlatformAdmin)) return problem('Acesso restrito.', 403);
    const body = parseJson(await request.text(), 500);
    if (!body || typeof body.id !== 'string' || !uuid.test(body.id) || typeof body.active !== 'boolean') {
      return problem('Evento inválido.');
    }
    if (db && actor) {
      const updated = await db.prepare(`UPDATE story_events SET active=?3,revision=?4
        WHERE id=?2 AND ${adminCheck} RETURNING id`)
        .bind(actor.hash,body.id.toLowerCase(),Number(body.active),randomUUID()).first();
      return updated ? json({saved:true}) : problem('Evento não encontrado.',404);
    }
    const { data, error } = await discoveryDb.from('story_events').update({ active: body.active })
      .eq('id', body.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return problem('Evento não encontrado.', 404);
    return json({ saved: true });
  } catch {
    return problem('Não foi possível atualizar o evento.', 503);
  }
}
