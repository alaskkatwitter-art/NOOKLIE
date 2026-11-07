import { detectedMedia } from '@/lib/chat/safety';

export function imageMatchesType(bytes: Uint8Array, mimeType: string) {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)
    && detectedMedia(bytes) === mimeType;
}

export function videoMatchesType(bytes: Buffer, mimeType: string) {
  if (bytes.length < 16) return false;
  return (mimeType === 'video/mp4' && bytes.toString('ascii', 4, 8) === 'ftyp') ||
    (mimeType === 'video/webm' && bytes.readUInt32BE(0) === 0x1a45dfa3);
}
