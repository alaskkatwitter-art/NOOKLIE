import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { discoveryDb as db, privateHeaders } from '@/lib/discovery/server';
import { getSessionTokenHash } from '@/lib/auth/session';

const buckets = new Set(['story-covers', 'stories', 'nook-media', 'chapter-media', 'social-stories']);
const revalidatable = new Set(['story-covers', 'nook-media', 'chapter-media']);
const thumbnailTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const browserCache = 'private, no-cache';


export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const bucket = params.get('bucket') || '';
    const path = params.get('path') || '';
    if (!buckets.has(bucket) || !path || path.length > 1500 ||
        path.split('/').some(part => part === '..' || part === '.') || /[\\\u0000]/.test(path)) {
      return new Response(null, { status: 400, headers: privateHeaders });
    }

    const original = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) +
      '/storage/v1/object/public/' + bucket + '/' + path.split('/').map(encodeURIComponent).join('/');
    const sessionHash = await getSessionTokenHash();
    if (bucket === 'social-stories' && !sessionHash) {
      return new Response(null, { status: 404, headers: privateHeaders });
    }
    const { data: allowed, error } = await db.rpc('content_media_allowed', {
      p_session: sessionHash,
      p_bucket: bucket,
      p_urls: [...new Set([original, decodeURI(original)])],
    });
    if (error) throw error;
    if (allowed !== true) return new Response(null, { status: 404, headers: privateHeaders });

    const file = await db.storage.from(bucket).download(path);
    if (file.error || !file.data) return new Response(null, { status: 404, headers: privateHeaders });
    const type = file.data.type;
    if (!/^(image|audio|video)\//.test(type)) return new Response(null, { status: 415, headers: privateHeaders });
    let data = Buffer.from(await file.data.arrayBuffer());
    const variant = params.get('variant');
    const width = variant === 'cover' && bucket === 'story-covers' ? 480
      : variant === 'feed' && bucket === 'nook-media' ? 960
      : 0;
    const range = request.headers.get('range');
    const headers = new Headers({
      'Content-Type': type,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      ...privateHeaders,
      'Accept-Ranges': 'bytes',
    });

    // The response is reusable only after the current viewer has been authorized.
    if (!range && revalidatable.has(bucket) && type.startsWith('image/')) {
      const digest = createHash('sha256').update(`media-v1:${width}:${type}:`).update(data).digest('base64url');
      const etag = `W/"${digest}"`;
      headers.set('Cache-Control', browserCache);
      headers.set('ETag', etag);
      const validators = request.headers.get('if-none-match')?.split(',').map(value => value.trim());
      if (validators?.some(value => value === '*' || value.replace(/^W\//, '') === etag.slice(2))) {
        return new Response(null, { status: 304, headers });
      }
    }

    if (width && thumbnailTypes.has(type)) {
      try {
        const image = sharp(data, { limitInputPixels: 25_000_000 });
        const metadata = await image.metadata();
        // Keep animated originals playable and keep oversized or invalid legacy images available.
        if ((metadata.pages ?? 1) === 1 && !(type === 'image/png' && data.includes('acTL'))) {
          const thumbnail = await image.autoOrient()
            .resize({ width, height: width * 2, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 76, effort: 2 })
            .toBuffer();
          if (thumbnail.length < data.length) {
            data = thumbnail;
            headers.set('Content-Type', 'image/webp');
          }
        }
      } catch {
        headers.set('Cache-Control', privateHeaders['Cache-Control']);
        headers.delete('ETag');
      }
    }

    if (range) {
      const match = range.match(/^bytes=(\d+)-(\d*)$/);
      const unsatisfiable = () => {
        headers.set('Content-Range', `bytes */${data.length}`);
        return new Response(null, { status: 416, headers });
      };
      if (!match) return unsatisfiable();
      const start = Number(match[1]);
      const end = Math.min(Number(match[2] || data.length - 1), data.length - 1);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= data.length) {
        return unsatisfiable();
      }
      headers.set('Content-Range', `bytes ${start}-${end}/${data.length}`);
      headers.set('Content-Length', String(end - start + 1));
      return new Response(new Uint8Array(data.subarray(start, end + 1)), { status: 206, headers });
    }
    headers.set('Content-Length', String(data.length));
    return new Response(new Uint8Array(data), { headers });
  } catch {
    return new Response(null, { status: 503, headers: privateHeaders });
  }
}
