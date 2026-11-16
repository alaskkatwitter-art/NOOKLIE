import { isPublicMediaBucket, r2MediaResponse, validMediaPath } from '@/lib/media/storage';

const imageTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ bucket: string; path: string[] }> },
) {
  try {
    const { bucket, path } = await params;
    const key = path.join('/');
    if (!isPublicMediaBucket(bucket) || !validMediaPath(key)) return new Response(null, { status: 404 });

    const file = await r2MediaResponse(bucket, key, request.headers.get('If-None-Match'));
    if (!file) return new Response(null, { status: 404 });
    if (file.status !== 304 && !imageTypes.has(file.headers.get('Content-Type') || '')) {
      await file.body?.cancel();
      return new Response(null, { status: 415 });
    }
    file.headers.set('Cache-Control', 'public, max-age=3600');
    file.headers.set('X-Content-Type-Options', 'nosniff');
    file.headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
    return file;
  } catch {
    return new Response(null, { status: 503 });
  }
}
