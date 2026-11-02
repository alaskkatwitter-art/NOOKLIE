import { NextResponse } from 'next/server';
import { discoveryDb, getDiscoveryReader, privateHeaders, uuid } from '@/lib/discovery/server';

export async function POST(request: Request) {
  try {
    const reader = await getDiscoveryReader();
    if (!reader) return new NextResponse(null, { status: 401, headers: privateHeaders });
    const raw = await request.text();
    const body = raw.length <= 300 ? JSON.parse(raw) : null;
    if (!body || typeof body.story_id !== 'string' || !uuid.test(body.story_id) || Object.keys(body).some(k => k !== 'story_id')) return new NextResponse(null, { status: 400, headers: privateHeaders });
    const { data, error } = await discoveryDb.rpc('record_discovery_activity', { p_account: reader.accountId, p_story: body.story_id });
    if (error) throw error;
    return NextResponse.json({ recorded: data === true }, { headers: privateHeaders });
  } catch { return new NextResponse(null, { status: 400, headers: privateHeaders }); }
}
