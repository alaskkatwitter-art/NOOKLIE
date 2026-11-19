import { env } from 'cloudflare:workers';
import type { MediaBucket } from '../lib/media/r2-binding';

export function getMediaBucket(): MediaBucket | undefined {
  try {
    return (env as { NOOKLIE_MEDIA?: MediaBucket }).NOOKLIE_MEDIA;
  } catch {
    return undefined;
  }
}

export function getHistoricalMediaBucket(): Pick<MediaBucket, 'get'> | undefined {
  return (env as { NOOKLIE_HISTORICAL_MEDIA?: Pick<MediaBucket, 'get'> }).NOOKLIE_HISTORICAL_MEDIA;
}
