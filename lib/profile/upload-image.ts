import { optimizeUploadedImage } from '@/lib/media/optimize-upload';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { sameOrigin } from '@/lib/chat/server';
import { imageMatchesType } from '@/lib/security/uploads';
import { parseImageFraming, profileGifLimits, validateProfileGif, type ProfileImageKind } from './animation';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
);
const imageOptions = {
  avatar: { bucket: 'avatars', maxBytes: 5 * 1024 * 1024, previewBytes: 160_000 },
  cover: { bucket: 'profile-covers', maxBytes: 8 * 1024 * 1024, previewBytes: 500_000 },
};
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
  const { bucket, maxBytes, previewBytes } = imageOptions[kind];
  const gifLimit = profileGifLimits[kind];
  const urlColumn = `${kind}_url` as const;
  const animationColumn = `${kind}_animation` as const;
  const storage = supabase.storage.from(bucket);
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
      if (!(gif instanceof File) || gif.type !== 'image/gif' || poster.type !== 'image/webp') {
        return failure('Envie um GIF e sua miniatura WebP estática.', 400);
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

    const previous = await supabase.from('profiles')
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
      const { error } = await storage.upload(file.path, file.bytes, {
        contentType: file.type, upsert: false, cacheControl: '86400',
      });
      if (error) throw error;
      uploaded.push(file.path);
    }

    const url = storage.getPublicUrl(posterPath).data.publicUrl;
    const animation = framing && { ...framing, url: storage.getPublicUrl(gifPath).data.publicUrl };
    const previousUrl = previous.data[urlColumn];
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
      const prefix = storage.getPublicUrl(`${auth.userId}/`).data.publicUrl;
      const owned = [previousUrl, previousAnimation.url]
        .filter((value): value is string => typeof value === 'string' && value.startsWith(prefix))
        .map(value => value.slice(prefix.length))
        .filter(name => new RegExp(`^${kind}-[0-9a-f-]{36}\\.(webp|gif)$`, 'i').test(name))
        .map(name => `${auth.userId}/${name}`);
      if (owned.length) await storage.remove(owned).catch(() => undefined);
    }
    return Response.json({ [urlColumn]: url, [animationColumn]: animation });
  } catch (error) {
    console.error('profile image upload', kind, error);
    return failure('Não foi possível atualizar a imagem.', 500);
  } finally {
    if (!retainUploads && uploaded.length) await storage.remove(uploaded).catch(() => undefined);
  }
}
