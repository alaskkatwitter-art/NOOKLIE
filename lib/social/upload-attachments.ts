import { randomUUID } from 'node:crypto';
import { chatDb } from '@/lib/chat/server';
import { imageMatchesType, videoMatchesType } from '@/lib/security/uploads';
import { feedImageTypes, feedVideoTypes, maxFeedUploadBytes } from './attachments';

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/webm': 'webm',
};

export class AttachmentError extends Error {}

export async function uploadFeedAttachments(files: File[], profileId: string, imagesOnly = false) {
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
  const paths: string[] = [];
  try {
    const media = [];
    for (const { buffer, file, mediaType } of validated) {
      const path = `${profileId}/feed-${randomUUID()}.${extensions[file.type]}`;
      const upload = await chatDb.storage.from('nook-media').upload(path, buffer, { contentType: file.type, cacheControl: '3600', upsert: false });
      if (upload.error) throw upload.error;
      paths.push(path);
      media.push({ media_url: chatDb.storage.from('nook-media').getPublicUrl(path).data.publicUrl, media_type: mediaType });
    }
    return { media, paths };
  } catch (error) {
    if (paths.length) await chatDb.storage.from('nook-media').remove(paths);
    throw error;
  }
}
