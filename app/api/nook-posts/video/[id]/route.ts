import { chatDb, privateHeaders, uuid } from '@/lib/chat/server';
import { isPublicPostVisible } from '@/lib/moderation/content-visibility';
import { contentMediaUrl } from '@/lib/security/content-media';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const unavailable = () => new Response(null, { status: 404, headers: privateHeaders });
    if (!uuid.test(id)) return unavailable();
    const { data, error } = await chatDb.from('nook_post_media').select('post_id,media_url').eq('id', id).eq('media_type', 'video').maybeSingle();
    if (error) throw error;
    if (!data || !(await isPublicPostVisible(chatDb, data.post_id))) return unavailable();
    const location = contentMediaUrl(data.media_url);
    if (!location?.startsWith('/api/content-media?')) return unavailable();
    const url = new URL(location, request.url);
    return new Response(null, { status: 307, headers: { ...privateHeaders, Location: url.href } });
  } catch (error) {
    console.error('feed video', error);
    return new Response(null, { status: 503, headers: privateHeaders });
  }
}
