import type { SupabaseClient } from '@supabase/supabase-js';
import { getMediaBucket } from '@/lib/media/r2-binding';

const publicBuckets = new Set(['avatars', 'profile-covers', 'stickers']);
const mediaBuckets = new Set([
  ...publicBuckets, 'story-covers', 'stories', 'nook-media', 'chapter-media',
  'social-stories', 'group-avatars', 'private-chat',
]);

type OriginBucket = ReturnType<SupabaseClient['storage']['from']>;

export function isPublicMediaBucket(bucket: string) {
  return publicBuckets.has(bucket);
}

export function validMediaPath(path: string) {
  return path.length > 0 && path.length <= 1000 &&
    !/[\\\u0000]/.test(path) &&
    path.split('/').every(part => part.length > 0 && part !== '.' && part !== '..');
}

export function mediaStorage(db: Pick<SupabaseClient, 'storage'>, bucket: string) {
  const origin = db.storage.from(bucket);
  const storage = mediaBuckets.has(bucket) ? getMediaBucket() : undefined;
  if (!storage) return origin;

  return {
    getPublicUrl(path: string) {
      const host = process.env.NOOKLIE_MEDIA_ORIGIN;
      if (!host || !isPublicMediaBucket(bucket)) return origin.getPublicUrl(path);
      const encoded = path.split('/').map(encodeURIComponent).join('/');
      return { data: { publicUrl: `${host}/api/public-media/${bucket}/${encoded}` } };
    },
    async upload(...[path, input, options]: Parameters<OriginBucket['upload']>) {
      try {
        if (!validMediaPath(path)) throw new Error('Invalid media path.');
        const bytes = input instanceof Blob ? await input.arrayBuffer() : input;
        if (!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes)) {
          throw new Error('Invalid media bytes.');
        }
        const key = `${bucket}/${path}`;
        const stored = await storage.put(key, bytes, {
          httpMetadata: { contentType: options?.contentType || 'application/octet-stream' },
          ...(options?.upsert ? {} : { onlyIf: { etagDoesNotMatch: '*' } }),
        });
        if (!stored) throw new Error('Media already exists.');
        return { data: { path, id: key, fullPath: key }, error: null };
      } catch {
        return { data: null, error: new Error('Unable to store media in R2.') };
      }
    },
    async download(path: string) {
      try {
        if (!validMediaPath(path)) throw new Error('Invalid media path.');
        const stored = await storage.get(`${bucket}/${path}`);
        return stored ? { data: await stored.blob(), error: null } : await origin.download(path);
      } catch {
        return { data: null, error: new Error('Unable to download media from R2.') };
      }
    },
    async remove(paths: string[]) {
      try {
        if (paths.some(path => !validMediaPath(path))) throw new Error('Invalid media path.');
        const keys = paths.map(path => `${bucket}/${path}`);
        const lookup = await Promise.all(keys.map(key => storage.head(key)));
        const legacy = paths.filter((_, index) => !lookup[index] || lookup[index]?.customMetadata?.supabaseUpdatedAt);
        if (legacy.length) {
          const removed = await origin.remove(legacy);
          if (removed.error) return removed;
        }
        if (keys.length) await storage.delete(keys);
        return { data: [], error: null };
      } catch {
        return { data: null, error: new Error('Unable to remove media from R2.') };
      }
    },
  };
}

export async function r2MediaResponse(bucket: string, path: string, validators: string | null) {
  const storage = getMediaBucket();
  if (!storage || !mediaBuckets.has(bucket) || !validMediaPath(path)) return null;

  const key = `${bucket}/${path}`;
  const stored = await storage.get(key);
  if (!stored) return null;

  const headers = new Headers({ ETag: stored.httpEtag });
  const matches = validators?.split(',').some(value => {
    const clean = value.trim().replace(/^W\//, '');
    return clean === '*' || clean === stored.httpEtag;
  });
  if (matches) {
    await stored.body.cancel();
    return new Response(null, { status: 304, headers });
  }
  headers.set('Content-Length', String(stored.size));
  headers.set('Content-Type', stored.httpMetadata?.contentType || 'application/octet-stream');
  return new Response(stored.body, { headers });
}
