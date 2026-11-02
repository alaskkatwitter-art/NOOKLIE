import { NextResponse } from 'next/server';
import { discoveryDb, getDiscoveryReader, privateHeaders } from '@/lib/discovery/server';
import { favoriteFandoms } from '@/lib/discovery/preferences';

export async function GET() {
  try {
    const reader = await getDiscoveryReader();
    if (!reader) return NextResponse.json({ error: 'Entre para escolher seus fandoms.' }, { status: 401, headers: privateHeaders });
    const [preferences, catalog] = await Promise.all([
      discoveryDb.from('discovery_preferences').select('favorite_fandoms').eq('user_id', reader.accountId).maybeSingle(),
      discoveryDb.rpc('discovery_fandom_catalog'),
    ]);
    if (preferences.error || catalog.error) throw preferences.error || catalog.error;
    return NextResponse.json({ account_id: reader.accountId, favorite_fandoms: preferences.data?.favorite_fandoms || [], catalog: catalog.data || [] }, { headers: privateHeaders });
  } catch { return NextResponse.json({ error: 'Não foi possível carregar seus fandoms.' }, { status: 503, headers: privateHeaders }); }
}

export async function PUT(request: Request) {
  try {
    const reader = await getDiscoveryReader();
    if (!reader) return NextResponse.json({ error: 'Entre para salvar seus fandoms.' }, { status: 401, headers: privateHeaders });
    if (request.headers.get('X-Discovery-Account') !== reader.accountId) return NextResponse.json({ error: 'Sua conta mudou. Reabra esta página.' }, { status: 409, headers: privateHeaders });
    const raw = await request.text();
    let body;
    try { body = raw.length <= 8000 ? JSON.parse(raw) : null; } catch { body = null; }
    const fandoms = favoriteFandoms(body?.favorite_fandoms);
    if (!fandoms || Object.keys(body).some(k => k !== 'favorite_fandoms')) return NextResponse.json({ error: 'Escolha até 30 fandoms com no máximo 100 caracteres cada.' }, { status: 400, headers: privateHeaders });
    const { error } = await discoveryDb.from('discovery_preferences').upsert({ user_id: reader.accountId, favorite_fandoms: fandoms, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw error;
    return NextResponse.json({ saved: true, favorite_fandoms: fandoms }, { headers: privateHeaders });
  } catch { return NextResponse.json({ error: 'Não foi possível salvar. Suas escolhas ainda não foram sincronizadas.' }, { status: 503, headers: privateHeaders }); }
}
