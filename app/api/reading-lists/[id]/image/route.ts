import { getSessionTokenHash } from '@/lib/auth/session';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1Books } from '@/lib/database/d1-books';
import { safeChapterHtml } from '@/lib/security/html';
import { previewImageStorage } from '@/lib/media/preview-images';
import { randomUUID } from 'node:crypto';
import { chatActor, chatDb, sameOrigin, privateHeaders, uuid } from '@/lib/chat/server';
import { currentViewerProfileId, isPublicProfileVisible } from '@/lib/moderation/content-visibility';
import { imageMatchesType } from '@/lib/security/uploads';
import { mediaStorage } from '@/lib/media/storage';
import { optimizeUploadedImage } from '@/lib/media/optimize-upload';
import { readingListImageUrl } from '@/lib/reading-lists/image';

const legacyStorage = () => mediaStorage(chatDb, 'chapter-media');
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const maxBytes = 3 * 1024 * 1024;
type Context = { params: Promise<{ id: string }> };

function respond(error: string, status: number) {
  return Response.json({ error }, { status, headers: privateHeaders });
}

function validPath(listId: string, path: string) {
  return new RegExp('^reading-lists/' + listId + '/[0-9a-f-]{36}\\.(jpg|png|webp)$').test(path);
}

async function removeImage(storage: Pick<ReturnType<typeof legacyStorage>, 'remove'> | ReturnType<typeof previewImageStorage>, listId: string, path: string | null) {
  if (!path || !validPath(listId, path)) return;
  try {
    const result = await storage.remove([path]);
    if (result.error) console.error('Reading list image cleanup failed');
  } catch {
    console.error('Reading list image cleanup failed');
  }
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    if (!uuid.test(id)) return respond('Imagem indisponível.', 404);
    const db = getD1PreviewDatabase('auth');
    if (db) {
      const list = await d1Books(db,safeChapterHtml).list(await getSessionTokenHash(),id);
      if (!list?.image_path || !validPath(id,list.image_path)) return respond('Imagem indisponível.',404);
      const image = await previewImageStorage('chapter-media').download(list.image_path);
      return image.data ? imageResponse(image.data,list.image_path) : respond('Imagem indisponível.',404);
    }
    const list = await chatDb.from('reading_lists').select('id,user_id,is_public,image_path,name')
      .eq('id', id).neq('name', 'Biblioteca').maybeSingle();
    if (list.error) throw list.error;
    if (!list.data?.image_path || !validPath(id, list.data.image_path)) return respond('Imagem indisponível.', 404);
    const viewer = await currentViewerProfileId(chatDb);
    if (viewer !== list.data.user_id && (!list.data.is_public ||
        !(await isPublicProfileVisible(chatDb, list.data.user_id, viewer)))) {
      return respond('Imagem indisponível.', 404);
    }
    const image = await legacyStorage().download(list.data.image_path);
    if (image.error || !image.data) return respond('Imagem indisponível.', 404);
    return imageResponse(image.data,list.data.image_path);
  } catch {
    return respond('Não foi possível carregar a imagem da lista.', 503);
  }
}

function imageResponse(data: Blob,path: string) {
  const extension = path.split('.').pop();
  return new Response(data,{headers:{
    ...privateHeaders,'Content-Type': extension==='jpg' ? 'image/jpeg' : 'image/'+extension,
    'X-Content-Type-Options':'nosniff','Content-Disposition':'inline','Content-Security-Policy':"default-src 'none'; sandbox",
  }});
}

async function changeImage(request: Request, id: string, remove: boolean) {
  let uploaded: string | null = null;
  let committed = false;
  let storage: ReturnType<typeof legacyStorage> | ReturnType<typeof previewImageStorage> | undefined;
  try {
    if (!sameOrigin(request)) return respond('Acesso restrito.', 403);
    const db = getD1PreviewDatabase('auth');
    storage = db ? previewImageStorage('chapter-media') : legacyStorage();
    const hash = db ? await getSessionTokenHash() : null;
    const viewer = db && hash ? await db.prepare('SELECT profile_id FROM d1_social_actors WHERE token_hash=?')
      .bind(hash).first<{profile_id:string}>() : null;
    const actor = db ? viewer && { profileId:viewer.profile_id } : await chatActor();
    if (!actor) return respond('Entre para editar sua lista.', 401);
    if (!uuid.test(id)) return respond('Lista indisponível.', 404);
    const list = db && hash ? {data:await db.prepare(`SELECT l.id,l.image_path FROM reading_lists l JOIN d1_social_actors a
      ON a.profile_id=l.user_id WHERE a.token_hash=? AND l.id=? AND l.name<>'Biblioteca'`)
      .bind(hash,id).first<{id:string;image_path:string|null}>(),error:null}
      : await chatDb.from('reading_lists').select('id,image_path')
      .eq('id', id).eq('user_id', actor.profileId).neq('name', 'Biblioteca').maybeSingle();
    if (list.error) throw list.error;
    if (!list.data) return respond('Lista indisponível.', 404);
    if (!remove) {
      if (Number(request.headers.get('content-length')) > maxBytes + 64 * 1024) {
        return respond('Use uma imagem de até 3 MB.', 413);
      }
      const form = await request.formData();
      const file = form.get('image');
      if (!(file instanceof File) || !file.size || !Object.hasOwn(extensions, file.type)) {
        return respond('Escolha uma imagem JPG, PNG ou WebP.', 400);
      }
      if (file.size > maxBytes) return respond('Use uma imagem de até 3 MB.', 413);
      const bytes = Buffer.from(await file.arrayBuffer());
      if (!imageMatchesType(bytes, file.type)) return respond('O arquivo não corresponde ao formato da imagem.', 415);
      uploaded = 'reading-lists/' + id + '/' + randomUUID() + '.' + extensions[file.type];
      const result = await storage.upload(uploaded, await optimizeUploadedImage(bytes, file.type, 640),
        { contentType: file.type, upsert: false });
      if (result.error) throw result.error;
    }
    if (db && hash) {
      const row = await db.prepare(`UPDATE reading_lists SET image_path=?1 WHERE id=?2 AND image_path IS ?3 AND name<>'Biblioteca'
        AND user_id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?4) RETURNING image_path`)
        .bind(uploaded,id,list.data.image_path,hash).first<{image_path:string|null}>();
      if (!row) return respond('A imagem mudou em outra janela. Atualize a página e tente novamente.',409);
      committed = true;
      await removeImage(storage,id,list.data.image_path);
      return Response.json({image_url:readingListImageUrl(id,row.image_path)},{headers:privateHeaders});
    }
    let query = chatDb.from('reading_lists').update({ image_path: uploaded }).eq('id', id).eq('user_id', actor.profileId);
    query = list.data.image_path ? query.eq('image_path', list.data.image_path) : query.is('image_path', null);
    const result = await query.select('id,image_path').maybeSingle();
    if (result.error) throw result.error;
    if (!result.data) return respond('A imagem mudou em outra janela. Atualize a página e tente novamente.', 409);
    committed = true;
    await removeImage(storage,id,list.data.image_path);
    return Response.json({ image_url: readingListImageUrl(id, result.data.image_path) }, { headers: privateHeaders });
  } catch {
    return respond('Não foi possível salvar a imagem da lista.', 503);
  } finally {
    if (storage && uploaded && !committed) await removeImage(storage,id,uploaded);
  }
}

export async function POST(request: Request, { params }: Context) {
  return changeImage(request, (await params).id, false);
}
export async function DELETE(request: Request, { params }: Context) {
  return changeImage(request, (await params).id, true);
}
