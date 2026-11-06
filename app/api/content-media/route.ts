import { discoveryDb as db, privateHeaders } from '@/lib/discovery/server';
import { getSessionTokenHash } from '@/lib/auth/session';

const buckets = new Set(['story-covers', 'stories', 'nook-media', 'chapter-media', 'social-stories']);

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
    const data = new Uint8Array(await file.data.arrayBuffer());
    const headers = {
      'Content-Type': type,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      ...privateHeaders,
      'Accept-Ranges': 'bytes',
    };
    const range = request.headers.get('range');
    if (range) {
      const match = range.match(/^bytes=(\d+)-(\d*)$/);
      const unsatisfiable = () => new Response(null, {
        status: 416, headers: { ...headers, 'Content-Range': `bytes */${data.length}` },
      });
      if (!match) return unsatisfiable();
      const start = Number(match[1]);
      const end = Math.min(Number(match[2] || data.length - 1), data.length - 1);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= data.length) {
        return unsatisfiable();
      }
      return new Response(data.slice(start, end + 1), {
        status: 206,
        headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${data.length}`, 'Content-Length': String(end - start + 1) },
      });
    }
    return new Response(data, { headers: { ...headers, 'Content-Length': String(data.length) } });
  } catch {
    return new Response(null, { status: 503, headers: privateHeaders });
  }
}
