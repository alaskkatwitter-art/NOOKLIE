import { getD1PreviewDatabase } from '@/lib/database/preview';
import { getMediaBucket } from '@/lib/media/r2-binding';
import { mediaStorage } from '@/lib/media/storage';
import { optimizeUploadedImage } from '@/lib/media/optimize-upload';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { sameOrigin } from '@/lib/chat/server';
import { imageMatchesType } from '@/lib/security/uploads';
import { parseImageFraming, profileGifLimits, profileImageLimits, validateProfileGif, type ProfileImageKind } from './animation';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);
const imageBuckets = { avatar: 'avatars', cover: 'profile-covers' };
const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function staticImage(bytes: Buffer, type: string) {
  if (!imageMatchesType(bytes, type)) return false;
  if (type === 'image/webp') {
    return bytes.length >= 21 && (bytes.toString('ascii', 12, 16) !== 'VP8X' || (bytes[20] & 2) === 0);
  }
  if (type === 'image/png') {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      if (bytes.toString('ascii', offset + 4, offset + 8) === 'acTL') return false;
      offset += 12 + bytes.readUInt32BE(offset);
    }
  }
  return true;
}

export async function uploadProfileImage(request: Request, kind: ProfileImageKind) {
  const bucket = imageBuckets[kind];
  const { maxBytes, previewBytes } = profileImageLimits[kind];
  const gifLimit = profileGifLimits[kind];
  const urlColumn = `${kind}_url` as const;
  const animationColumn = `${kind}_animation` as const;
  const db = getD1PreviewDatabase('auth');
  const r2 = db ? getMediaBucket() : undefined;
  const storage = db ? null : mediaStorage(supabase, bucket);
  const publicUrl = (path: string) => db
    ? '/api/public-media/' + bucket + '/' + path
    : storage!.getPublicUrl(path).data.publicUrl;
  const remove = async (paths: string[]) => {
    if (db) await r2?.delete(paths.map(path => bucket + '/' + path));
    else await storage!.remove(paths);
  };
  const uploaded: string[] = [];
  let retainUploads = false;
  const failure = (message: string, status: number) => Response.json({ error: message }, { status });
  try {
    if (!sameOrigin(request)) return failure('Origem inválida.', 403);
    const auth = await getAuthenticatedUserContext();
    if (!auth) return failure('Você precisa estar logado.', 401);
    if (Number(request.headers.get('content-length')) > maxBytes + 64 * 1024) {
      return failure('O envio excede o tamanho permitido.', 413);
    }

    let form: FormData;
    try { form = await request.formData(); }
    catch { return failure('Não foi possível ler a imagem enviada.', 400); }
    const poster = form.get('file');
    const gif = form.get('animation');
    const rawFraming = form.get('framing');
    if (!(poster instanceof File) || !Object.hasOwn(extensions, poster.type)) {
      return failure('Envie uma imagem JPG, PNG ou WebP.', 400);
    }
    if (poster.size > (gif === null ? maxBytes : previewBytes)) {
      return failure(gif === null ? `A imagem pode ter no máximo ${maxBytes / 1024 / 1024} MB.` : 'A miniatura estática ficou grande demais.', 413);
    }

    let framing = null;
    let animationBytes = null;
    if (gif !== null) {
      if (!(gif instanceof File) || gif.type !== 'image/gif') {
        return failure('Envie um GIF com uma miniatura estática.', 400);
      }
      if (gif.size > gifLimit.bytes) return failure(`Use um GIF de até ${gifLimit.label}.`, 413);
      if (typeof rawFraming !== 'string' || rawFraming.length > 256) return failure('Enquadramento inválido.', 400);
      try { framing = parseImageFraming(JSON.parse(rawFraming)); }
      catch { return failure('Enquadramento inválido.', 400); }
      if (!framing) return failure('Enquadramento inválido.', 400);
      animationBytes = Buffer.from(await gif.arrayBuffer());
      const gifError = validateProfileGif(animationBytes, kind);
      if (gifError) return failure(gifError, 400);
    }
    const posterBytes = Buffer.from(await poster.arrayBuffer());
    if (!staticImage(posterBytes, poster.type)) return failure('A miniatura precisa ser uma imagem estática válida.', 415);

    if (db && !r2) throw new Error('R2 binding missing');
    const previous = db ? { error: null, data: await db.prepare(
      `SELECT id,${urlColumn},${animationColumn} FROM profiles WHERE user_id=?`,
    ).bind(auth.userId).first<{ id: string } & Record<typeof urlColumn, string | null> &
      Record<typeof animationColumn, string | null>>() } : await supabase.from('profiles')
      .select('id, avatar_url, cover_url, avatar_animation, cover_animation')
      .eq('user_id', auth.userId).maybeSingle();
    if (previous.error) throw previous.error;
    if (!previous.data) return failure('Perfil não encontrado.', 404);
    const stem = `${auth.userId}/${kind}-${crypto.randomUUID()}`;
    const posterPath = `${stem}.${extensions[poster.type]}`;
    const gifPath = `${stem}.gif`;
    const optimizedPoster = await optimizeUploadedImage(posterBytes, poster.type, kind === 'avatar' ? 512 : 1600);
    const files = [{ path: posterPath, bytes: optimizedPoster, type: poster.type }];
    if (animationBytes) files.push({ path: gifPath, bytes: animationBytes, type: 'image/gif' });
    for (const file of files) {
      if (r2) {
        const result = await r2.put(bucket + '/' + file.path, file.bytes, {
          onlyIf: { etagDoesNotMatch: '*' }, httpMetadata: { contentType: file.type },
        });
        if (!result) throw new Error('Unable to store profile image');
        uploaded.push(file.path);
        continue;
      }
      const { error } = await storage!.upload(file.path, file.bytes, {
        contentType: file.type, upsert: false, cacheControl: '86400',
      });
      if (error) throw error;
      uploaded.push(file.path);
    }

    const url = publicUrl(posterPath);
    const animation = framing && { ...framing, url: publicUrl(gifPath) };
    const previousUrl = previous.data[urlColumn];
    if (db) {
      retainUploads = true;
      const saved = await db.prepare(`UPDATE profiles SET ${urlColumn}=?1,${animationColumn}=?2
        WHERE id=?3 AND user_id=?4 AND ${urlColumn} IS ?5
        AND EXISTS (SELECT 1 FROM auth_sessions s JOIN auth_accounts a ON a.id=s.user_id
          WHERE s.user_id=?4 AND s.token_hash=?6 AND a.account_status='active' AND julianday(s.expires_at)>julianday('now'))
        RETURNING id`).bind(url, animation ? JSON.stringify(animation) : null, previous.data.id, auth.userId,
          previousUrl, auth.sessionTokenHash).first();
      if (!saved) {
        retainUploads = false;
        return failure('A imagem foi alterada em outra sessão. Recarregue e tente novamente.', 409);
      }
      const old = previous.data[animationColumn];
      const oldAnimation = typeof old === 'string' ? JSON.parse(old) : null;
      const prefix = publicUrl(auth.userId + '/');
      const owned = [previousUrl, oldAnimation?.url].flatMap(value => {
        if (typeof value !== 'string' || !value.startsWith(prefix)) return [];
        const name = value.slice(prefix.length);
        return /^((avatar|cover)-[0-9a-f-]{36})\.(jpg|png|webp|gif)$/i.test(name)
          ? [auth.userId + '/' + name] : [];
      });
      if (owned.length) await remove(owned).catch(() => undefined);
      return Response.json({ [urlColumn]: url, [animationColumn]: animation });
    }
    let update = supabase.from('profiles').update({ [urlColumn]: url, [animationColumn]: animation })
      .eq('id', previous.data.id);
    update = previousUrl === null ? update.is(urlColumn, null) : update.eq(urlColumn, previousUrl);
    // A transport failure after the database commits must not delete files the profile references.
    retainUploads = true;
    const saved = await update.select('id').maybeSingle();
    if (saved.error) {
      const check = await supabase.from('profiles').select('avatar_url, cover_url').eq('id', previous.data.id).maybeSingle();
      retainUploads = Boolean(check.error || check.data?.[urlColumn] === url);
      if (check.error || check.data?.[urlColumn] !== url) throw saved.error;
    } else if (!saved.data) {
      retainUploads = false;
      return failure('A imagem foi alterada em outra sessão. Recarregue e tente novamente.', 409);
    }

    const previousAnimation = previous.data[animationColumn];
    if (previousAnimation) {
      const prefix = storage!.getPublicUrl(`${auth.userId}/`).data.publicUrl;
      const legacyPrefix = supabase.storage.from(bucket).getPublicUrl(`${auth.userId}/`).data.publicUrl;
      const owned = [previousUrl, typeof previousAnimation === 'string' ? null : previousAnimation.url]
        .flatMap(value => {
          if (typeof value !== 'string') return [];
          const ownerPrefix = [prefix, legacyPrefix].find(candidate => value.startsWith(candidate));
          return ownerPrefix ? [value.slice(ownerPrefix.length)] : [];
        })
        .filter(name => new RegExp(`^${kind}-[0-9a-f-]{36}\\.(jpg|png|webp|gif)$`, 'i').test(name))
        .map(name => `${auth.userId}/${name}`);
      if (owned.length) await storage!.remove(owned).catch(() => undefined);
    }
    return Response.json({ [urlColumn]: url, [animationColumn]: animation });
  } catch (error) {
    console.error('profile image upload', kind, error);
    return failure('Não foi possível atualizar a imagem.', 500);
  } finally {
    if (!retainUploads && uploaded.length) await remove(uploaded).catch(() => undefined);
  }
}
