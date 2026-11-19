import { canReadD1SocialStoryMedia } from '@/lib/database/d1-social-stories';
import { d1Feed } from '@/lib/database/d1-feed';
import { getHistoricalMediaBucket, getMediaBucket } from '@/lib/media/r2-binding';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1Books } from '@/lib/database/d1-books';
import { safeChapterHtml } from '@/lib/security/html';
import { r2MediaResponse } from '@/lib/media/storage';
import sharp from 'sharp';
import { discoveryDb as db, privateHeaders } from '@/lib/discovery/server';
import { getSessionTokenHash } from '@/lib/auth/session';

const buckets = new Set(['story-covers', 'stories', 'nook-media', 'chapter-media', 'social-stories']);
const revalidatable = new Set(['story-covers', 'nook-media', 'chapter-media']);
const safeHistoricalTypes = new Set(['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm']);
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
  let step = 'parameters';
  try {
    const params = new URL(request.url).searchParams;
    const bucket = params.get('bucket') || '';
    const path = params.get('path') || '';
    if (!buckets.has(bucket) || !path || path.length > 1500 ||
        path.split('/').some(part => part === '..' || part === '.') || /[\\\u0000]/.test(path)) {
      return new Response(null, { status: 400, headers: privateHeaders });
    }

    if (bucket === 'chapter-media' || bucket === 'nook-media' || bucket === 'story-covers' || bucket === 'social-stories' || bucket === 'stories') {
      const d1 = getD1PreviewDatabase('auth');
      const prefix = bucket === 'chapter-media' ? 'd1-chapters/' : bucket === 'nook-media' ? 'd1-feed/'
        : bucket === 'social-stories' ? 'd1-social-stories/' : 'd1-stories/';
      const isNew = bucket !== 'stories' && path.startsWith(prefix);
      const unavailable = () => new Response(null, { status: 404, headers: privateHeaders });
      if (isNew && !d1) return unavailable();
      if (d1) {
        const hash = await getSessionTokenHash();
        const relative = '/api/content-media?' + new URLSearchParams({ bucket, path });
        const historical = 'https://fwwgoyburkdybbqmvljk.supabase.co/storage/v1/object/public/' + bucket + '/';
        const encoded = historical + path.split('/').map(encodeURIComponent).join('/');
        const raw = historical + path;
        const urls = isNew ? [relative,relative,relative] : [relative,encoded,raw];
        const legacy = bucket === 'stories';
        let allowed = false;
        if (bucket === 'chapter-media' || legacy) {
          const rows = await d1.prepare(`SELECT chapter_id,media_url,0 AS banner FROM chapter_media WHERE media_url IN (?1,?2,?3)
            UNION ALL SELECT id,banner_url,1 FROM chapters WHERE banner_url IN (?1,?2,?3)`)
            .bind(...urls).all<{ chapter_id: string; media_url: string; banner: number }>();
          if (!rows.success) throw Error('Unable to look up chapter media');
          const books = d1Books(d1,safeChapterHtml);

          for (const row of rows.results) {
            const chapter = await books.chapterForReader(hash,row.chapter_id);
            if (row.banner ? chapter?.chapter.banner_url === row.media_url
              : chapter?.media.some((media: {media_url:string}) => media.media_url === row.media_url)) {
              allowed = true;
              break;
            }
          }
        }
        if (!allowed && (bucket === 'social-stories' || legacy)) {
          allowed = await canReadD1SocialStoryMedia(d1,hash,urls);
        }
        if (!allowed && (bucket === 'story-covers' || legacy)) {
          const rows = await d1.prepare('SELECT id FROM stories WHERE cover_url IN (?,?,?)')
            .bind(...urls).all<{id:string}>();
          if (!rows.success) throw Error('Unable to look up story cover');
          const books = d1Books(d1,safeChapterHtml);
          const visible = await Promise.all(rows.results.map(({id})=>books.story(hash,id)));
          allowed = visible.some(story=>story && urls.includes(String(story.cover_url)));
        }
        if (!allowed && (bucket === 'nook-media' || legacy)) {
          const rows = await d1.prepare(`SELECT post_id,NULL AS reply_id FROM nook_post_media WHERE media_url IN (?1,?2,?3)
            UNION ALL SELECT post_id,id FROM nook_comments WHERE image_url IN (?1,?2,?3)
            UNION ALL SELECT id,NULL FROM nook_posts WHERE image_url IN (?1,?2,?3)`)
            .bind(...urls).all<{post_id:string;reply_id:string|null}>();
          if (!rows.success) throw Error('Unable to look up feed media');
          const feed = d1Feed(d1);

          for (const row of rows.results) {
            if (await feed.post(hash,row.post_id) &&
              (!row.reply_id || (await feed.replyCards(hash,row.post_id,row.reply_id,false)).length)) {
              allowed = true;
              break;
            }
          }
        }
        if (!allowed) return unavailable();
        const storage = isNew ? getMediaBucket() : getHistoricalMediaBucket();
        const stored = await storage?.get(bucket + '/' + path);
        if (!stored) return unavailable();
        const headers = new Headers(privateHeaders);
        headers.set('X-Content-Type-Options','nosniff');
        const mime = stored.httpMetadata?.contentType ?? '';
        headers.set('Content-Type',safeHistoricalTypes.has(mime) ? mime : 'application/octet-stream');
        headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
        headers.set('Accept-Ranges','bytes');
        const range = request.headers.get('range');
        if (!range) {
          headers.set('Content-Length',String(stored.size));
          return new Response(stored.body,{headers});
        }
        const match = range.match(rangePattern);
        const start = match ? Number(match[1]) : stored.size;
        const end = match?.[2] ? Math.min(Number(match[2]),stored.size-1) : stored.size-1;
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stored.size) {
          await stored.body.cancel();
          headers.set('Content-Range','bytes */' + stored.size);
          return new Response(null,{status:416,headers});
        }
        headers.set('Content-Range',`bytes ${start}-${end}/${stored.size}`);
        headers.set('Content-Length',String(end-start+1));
        return new Response((await stored.blob()).slice(start,end+1),{status:206,headers});
      }
    }

    const storageUrl = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) + '/storage/v1/object/';
    const object = bucket + '/' + path.split('/').map(encodeURIComponent).join('/');
    const original = storageUrl + 'public/' + object;
    step = 'session';
    const sessionHash = await getSessionTokenHash();
    if (bucket === 'social-stories' && !sessionHash) {
      return new Response(null, { status: 404, headers: privateHeaders });
    }
    step = 'authorization';
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
    const fetchObject = async () => {
      const stored = await r2MediaResponse(bucket, path, upstreamHeaders.get('If-None-Match'));
      return stored ?? await fetch(storageUrl + object, {
        headers: upstreamHeaders,
        cache: 'no-store',
        redirect: 'manual',
      });
    };
    step = 'storage-fetch';
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
      if (upstream.status >= 500) console.error('nooklie-media-upstream', { status: upstream.status });
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

    step = 'storage-body';
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
  } catch (error) {
    const failure = error as { name?: string; code?: string; message?: string } | null;
    const reason = failure?.message?.match(/abort|cache|redirect|network|signal|fetch|invalid URL|receiver|RequestInit/i)?.[0];
    console.error('nooklie-media-error', { step, name: failure?.name, code: failure?.code, reason });
    return new Response(null, { status: 503, headers: privateHeaders });
  }
}
