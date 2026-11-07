import sharp from 'sharp';
import { discoveryDb as db, privateHeaders } from '@/lib/discovery/server';
import { getSessionTokenHash } from '@/lib/auth/session';

const buckets = new Set(['story-covers', 'stories', 'nook-media', 'chapter-media', 'social-stories']);
const revalidatable = new Set(['story-covers', 'nook-media', 'chapter-media']);
const thumbnailTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const browserCache = 'private, no-cache';
const storageTagPattern = /^"[a-f0-9]{32}(?:-\d{1,6})?"$/i;
const rangePattern = /^bytes=(\d+)-(\d*)$/;

// Only small generated variants live in memory. Each hit still checks both access and Storage.
const thumbnails = new Map<string, { sourceTag: string; bytes: Buffer }>();
const maxThumbnails = 64;
const maxThumbnailBytes = 256 * 1024;

function clientTag(width: number, storageTag: string) {
  return `W/"nook-media-v2-${width}-${storageTag.slice(1, -1)}"`;
}

function requestedStorageTags(request: Request, width: number) {
  const prefix = `"nook-media-v2-${width}-`;
  const tags = new Set<string>();
  for (const validator of request.headers.get('if-none-match')?.split(',') || []) {
    const tag = validator.trim().replace(/^W\//, '');
    if (!tag.startsWith(prefix)) continue;
    const sourceTag = '"' + tag.slice(prefix.length);
    if (storageTagPattern.test(sourceTag)) tags.add(sourceTag);
    if (tags.size >= 8) break;
  }
  return tags;
}

function rememberThumbnail(key: string, sourceTag: string, bytes: Buffer) {
  if (bytes.length > maxThumbnailBytes) return;
  thumbnails.delete(key);
  thumbnails.set(key, { sourceTag, bytes });
  if (thumbnails.size > maxThumbnails) {
    const oldest = thumbnails.keys().next().value;
    if (oldest !== undefined) thumbnails.delete(oldest);
  }
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const bucket = params.get('bucket') || '';
    const path = params.get('path') || '';
    if (!buckets.has(bucket) || !path || path.length > 1500 ||
        path.split('/').some(part => part === '..' || part === '.') || /[\\\u0000]/.test(path)) {
      return new Response(null, { status: 400, headers: privateHeaders });
    }

    const storageUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) + '/storage/v1/object/';
    const object = bucket + '/' + path.split('/').map(encodeURIComponent).join('/');
    const original = storageUrl + 'public/' + object;
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

    const variant = params.get('variant');
    const width = variant === 'cover' && bucket === 'story-covers' ? 480
      : variant === 'feed' && bucket === 'nook-media' ? 960
      : 0;
    const range = request.headers.get('range');
    const rangeMatch = range?.match(rangePattern);
    const eligible = !range && revalidatable.has(bucket);
    const requestedTags = eligible ? requestedStorageTags(request, width) : new Set<string>();
    const cacheKey = width + ':' + object;
    const cached = eligible && width ? thumbnails.get(cacheKey) : undefined;
    const upstreamTags = [...requestedTags];
    if (cached && !requestedTags.has(cached.sourceTag)) upstreamTags.push(cached.sourceTag);

    const secret = process.env.SUPABASE_SECRET_KEY!;
    const upstreamHeaders = new Headers({ apikey: secret, Authorization: 'Bearer ' + secret });
    if (upstreamTags.length) upstreamHeaders.set('If-None-Match', upstreamTags.join(', '));
    if (!width && range && rangeMatch) upstreamHeaders.set('Range', range);
    const fetchObject = () => fetch(storageUrl + object, {
      headers: upstreamHeaders,
      next: { revalidate: 0 },
      redirect: 'error',
      signal: request.signal,
    });
    let upstream = await fetchObject();
    if (upstream.status === 304 && !upstream.headers.has('etag') && upstreamTags.length !== 1) {
      upstreamHeaders.delete('If-None-Match');
      upstream = await fetchObject();
    }

    const headers = new Headers({
      ...privateHeaders,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Accept-Ranges': 'bytes',
    });
    const unchanged = upstream.status === 304;
    const sourceTag = upstream.headers.get('etag') || (unchanged ? upstreamTags[0] || '' : '');
    if (upstream.status === 416 && range) {
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) headers.set('Content-Range', contentRange);
      await upstream.body?.cancel();
      return new Response(null, { status: 416, headers });
    }
    if (!upstream.ok && !unchanged) {
      await upstream.body?.cancel();
      return new Response(null, { status: upstream.status >= 500 ? 503 : 404, headers });
    }
    const type = upstream.headers.get('content-type') || '';
    if (!unchanged) {
      if (!/^(image|audio|video)\//.test(type)) {
        await upstream.body?.cancel();
        return new Response(null, { status: 415, headers });
      }
      headers.set('Content-Type', type);
    }
    const length = upstream.headers.has('content-encoding') ? null : upstream.headers.get('content-length');
    const useTag = eligible && storageTagPattern.test(sourceTag) && (unchanged || type.startsWith('image/'));
    if (useTag) {
      headers.set('Cache-Control', browserCache);
      headers.set('ETag', clientTag(width, sourceTag));
      if (requestedTags.has(sourceTag) || request.headers.get('if-none-match')?.trim() === '*') {
        await upstream.body?.cancel();
        return new Response(null, { status: 304, headers });
      }
      if (cached?.sourceTag === sourceTag) {
        await upstream.body?.cancel();
        rememberThumbnail(cacheKey, sourceTag, cached.bytes);
        headers.set('Content-Type', 'image/webp');
        headers.set('Content-Length', String(cached.bytes.length));
        return new Response(new Uint8Array(cached.bytes), { headers });
      }
    }
    if (unchanged) return new Response(null, { status: 503, headers: privateHeaders });

    if ((!width && !range) || (upstream.status === 206 && !width && rangeMatch)) {
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) headers.set('Content-Range', contentRange);
      if (length) headers.set('Content-Length', length);
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    let bytes = Buffer.from(await upstream.arrayBuffer());
    if (width && thumbnailTypes.has(type)) {
      try {
        const image = sharp(bytes, { limitInputPixels: 25_000_000 });
        const metadata = await image.metadata();
        if ((metadata.pages ?? 1) === 1 && !(type === 'image/png' && bytes.includes('acTL'))) {
          const thumbnail = await image.autoOrient()
            .resize({ width, height: width * 2, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 76, effort: 2 })
            .toBuffer();
          if (thumbnail.length < bytes.length) {
            bytes = thumbnail;
            headers.set('Content-Type', 'image/webp');
            if (useTag) rememberThumbnail(cacheKey, sourceTag, bytes);
          }
        }
      } catch {
        headers.set('Cache-Control', privateHeaders['Cache-Control']);
        headers.delete('ETag');
      }
    }

    // Storage can ignore Range. Preserve partial playback in that case and for resized images.
    if (range) {
      const start = Number(rangeMatch?.[1]);
      const end = Math.min(Number(rangeMatch?.[2] || bytes.length - 1), bytes.length - 1);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= bytes.length) {
        headers.set('Content-Range', `bytes */${bytes.length}`);
        return new Response(null, { status: 416, headers });
      }
      headers.set('Content-Range', `bytes ${start}-${end}/${bytes.length}`);
      headers.set('Content-Length', String(end - start + 1));
      return new Response(new Uint8Array(bytes.subarray(start, end + 1)), { status: 206, headers });
    }
    headers.set('Content-Length', String(bytes.length));
    return new Response(new Uint8Array(bytes), { headers });
  } catch {
    return new Response(null, { status: 503, headers: privateHeaders });
  }
}
