import { NextResponse } from 'next/server';
import { discoveryDb, getDiscoveryReader, privateHeaders, uuid } from '@/lib/discovery/server';
import { isPublicStoryVisible } from '@/lib/moderation/content-visibility';

export async function GET(request: Request) {
  try {
    const reader = await getDiscoveryReader();
    if (!reader) return NextResponse.json({ error: 'Entre para sincronizar a leitura.' }, { status: 401, headers: privateHeaders });
    const params = new URL(request.url).searchParams;
    const chapterId = params.get('chapter') || '';
    if (!uuid.test(chapterId)) return new NextResponse(null, { status: 400, headers: privateHeaders });
    const chapter = await discoveryDb.from('chapters').select('id, story_id').eq('id', chapterId).eq('published', true).maybeSingle();
    if (chapter.error) throw chapter.error;
    if (!chapter.data || !(await isPublicStoryVisible(discoveryDb, chapter.data.story_id))) return new NextResponse(null, { status: 404, headers: privateHeaders });
    const { data, error } = await discoveryDb.from('reading_progress').select('chapter_id, progress_percent, position').eq('user_id', reader.profile.id).eq('story_id', chapter.data.story_id).maybeSingle();
    if (error) throw error;
    if (params.get('resume') === '1') {
      if (!data) return NextResponse.json({ chapter_id: null }, { headers: privateHeaders });
      const savedChapter = await discoveryDb.from('chapters').select('id').eq('id', data.chapter_id).eq('story_id', chapter.data.story_id).eq('published', true).maybeSingle();
      if (savedChapter.error) throw savedChapter.error;
      return NextResponse.json({ chapter_id: savedChapter.data?.id ?? null }, { headers: privateHeaders });
    }
    return NextResponse.json({ account_id: reader.accountId, progress: data?.chapter_id === chapterId ? data : null }, { headers: privateHeaders });
  } catch { return NextResponse.json({ error: 'Não foi possível restaurar a leitura.' }, { status: 503, headers: privateHeaders }); }
}

export async function PUT(request: Request) {
  try {
    const reader = await getDiscoveryReader();
    if (!reader) return new NextResponse(null, { status: 401, headers: privateHeaders });
    if (request.headers.get('X-Discovery-Account') !== reader.accountId) return new NextResponse(null, { status: 409, headers: privateHeaders });
    const raw = await request.text();
    let body;
    try { body = raw.length <= 1000 ? JSON.parse(raw) : null; } catch { body = null; }
    if (!body || typeof body.chapter_id !== 'string' || !uuid.test(body.chapter_id) || typeof body.story_id !== 'string' || !uuid.test(body.story_id) || !Number.isFinite(body.percent) || body.percent < 0 || body.percent > 100 || !Number.isInteger(body.position) || body.position < 0 || body.position > 10000 || !Number.isFinite(body.read_seconds) || body.read_seconds < 0 || body.read_seconds > 86400 || Object.keys(body).some(k => !['chapter_id', 'story_id', 'percent', 'position', 'read_seconds'].includes(k))) return new NextResponse(null, { status: 400, headers: privateHeaders });
    const { data, error } = await discoveryDb.rpc('record_discovery_activity', { p_account: reader.accountId, p_story: body.story_id, p_chapter: body.chapter_id, p_percent: body.percent, p_position: body.position, p_read: body.read_seconds >= 30 });
    if (error) throw error;
    return NextResponse.json({ saved: data === true }, { status: data ? 200 : 404, headers: privateHeaders });
  } catch { return NextResponse.json({ error: 'Não foi possível salvar a posição.' }, { status: 503, headers: privateHeaders }); }
}
