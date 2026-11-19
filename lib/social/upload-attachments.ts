import { getMediaBucket } from '@/lib/media/r2-binding';
import { mediaStorage } from '@/lib/media/storage';
import { optimizeUploadedImage } from '@/lib/media/optimize-upload';
import { randomUUID } from 'node:crypto';
import { chatDb } from '@/lib/chat/server';
import { imageMatchesType, videoMatchesType } from '@/lib/security/uploads';
import { feedImageTypes, feedVideoTypes, maxFeedUploadBytes } from './attachments';

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm',
};

export class AttachmentError extends Error {}

export async function uploadFeedAttachments(files: File[], profileId: string, imagesOnly = false, isolated = false) {
  if (!files.length || files.length > (imagesOnly ? 1 : 4) || files.reduce((size, file) => size + file.size, 0) > maxFeedUploadBytes) {
    throw new AttachmentError('Envie arquivos que somem até 4 MB.');
  }
  const validated = await Promise.all(files.map(async file => {
    const isVideo = feedVideoTypes.includes(file.type);
    if (!feedImageTypes.includes(file.type) && (!isVideo || imagesOnly)) {
      throw new AttachmentError(imagesOnly ? 'Envie uma imagem JPG, PNG, WebP ou GIF.' : 'Use JPG, PNG, WebP, GIF, MP4 ou WebM.');
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const valid = isVideo
      ? videoMatchesType(buffer, file.type)
      : imageMatchesType(buffer, file.type);
    if (!valid) throw new AttachmentError('O arquivo não corresponde ao formato informado.');
    return { buffer, file, mediaType: isVideo ? 'video' : file.type === 'image/gif' ? 'gif' : 'image' };
  }));
  const bucket = isolated ? getMediaBucket() : undefined;
  if (isolated && !bucket) throw Error('Preview media bucket unavailable');
  const paths: string[] = [];
  try {
    const media = [];
    for (const { buffer, file, mediaType } of validated) {
      const path = `${isolated ? 'd1-feed/' : ''}${profileId}/feed-${randomUUID()}.${extensions[file.type]}`;
      const optimizedBuffer = mediaType === 'image' ? await optimizeUploadedImage(buffer, file.type, 1600) : buffer;
      if (bucket) {
        const written = await bucket.put('nook-media/' + path, optimizedBuffer, {
          httpMetadata: { contentType: file.type }, onlyIf: { etagDoesNotMatch: '*' },
        });
        if (!written) throw Error('Unable to store feed attachment');
        paths.push(path);
        media.push({ media_url: '/api/content-media?' + new URLSearchParams({ bucket: 'nook-media', path }), media_type: mediaType });
      } else {
        const storage = mediaStorage(chatDb, 'nook-media');
        const upload = await storage.upload(path, optimizedBuffer, { contentType: file.type, cacheControl: '3600', upsert: false });
        if (upload.error) throw upload.error;
        paths.push(path);
        media.push({ media_url: storage.getPublicUrl(path).data.publicUrl, media_type: mediaType });
      }
    }
    return { media, paths };
  } catch (error) {
    if (paths.length) await removeFeedAttachments(paths, isolated);
    throw error;
  }
}

export async function removeFeedAttachments(paths: string[], isolated: boolean) {
  if (!paths.length) return;
  if (isolated) {
    await getMediaBucket()?.delete(paths.map(path => 'nook-media/' + path));
  } else {
    await mediaStorage(chatDb, 'nook-media').remove(paths);
  }
}
