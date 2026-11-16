import { env } from 'cloudflare:workers';
import type { MediaBucket } from '../lib/media/r2-binding';

export function getMediaBucket(): MediaBucket | undefined {
  try {
    return (env as { NOOKLIE_MEDIA?: MediaBucket }).NOOKLIE_MEDIA;
  } catch {
    return undefined;
  }
}
