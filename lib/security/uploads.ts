import { detectedMedia } from '@/lib/chat/safety';

export function imageMatchesType(bytes: Uint8Array, mimeType: string) {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)
    && detectedMedia(bytes) === mimeType;
}
