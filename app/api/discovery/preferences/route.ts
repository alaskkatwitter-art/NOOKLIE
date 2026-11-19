import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1FollowActor } from '@/lib/database/d1-follow-http';
import type { NooklieD1 } from '@/lib/database/d1';

async function d1Catalog(db: NooklieD1) {
  const rows = await db.prepare(`SELECT 'Universo original' AS name
    UNION ALL SELECT t.name FROM tags t JOIN tag_categories c ON c.id=t.category_id WHERE c.slug='fandom'
    UNION ALL SELECT j.value FROM released_stories s
      JOIN profiles p ON p.id=s.author_id JOIN auth_accounts a ON a.id=p.user_id
      JOIN json_each('[' || replace(json_quote(s.fandom), ',', '","') || ']') j
      WHERE p.moderation_hidden_at IS NULL AND coalesce(p.is_private,0)=0 AND a.account_status='active'`)
    .all<{ name: string | null }>();
  if (!rows.success) throw new Error('Fandom catalog unavailable');
  const names = rows.results.flatMap(({ name }) => name?.trim() && name.trim().length <= 100 ? [name.trim()] : [])
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const unique = new Map<string, string>();
  for (const name of names) {
    const key = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (!unique.has(key)) unique.set(key, name);
  }
  return [...unique.values()].slice(0, 300);
}
import { NextResponse } from 'next/server';
import { discoveryDb, getDiscoveryReader, privateHeaders } from '@/lib/discovery/server';
import { favoriteFandoms } from '@/lib/discovery/preferences';

export async function GET() {
  try {
    const db = getD1PreviewDatabase('auth');
    const actor = db ? await d1FollowActor(db) : null;
    if (db && actor) {
      const [row, catalog] = await Promise.all([
        db.prepare(`SELECT a.user_id, p.favorite_fandoms FROM d1_social_actors a
          LEFT JOIN discovery_preferences p ON p.user_id=a.user_id WHERE a.token_hash=?`)
          .bind(actor.hash).first<{ user_id: string; favorite_fandoms: string | null }>(),
        d1Catalog(db),
      ]);
      if (row) return NextResponse.json({ account_id: row.user_id,
        favorite_fandoms: JSON.parse(row.favorite_fandoms ?? '[]'), catalog }, { headers: privateHeaders });
    }
    const reader = db ? null : await getDiscoveryReader();
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
    const db = getD1PreviewDatabase('auth');
    const actor = db ? await d1FollowActor(db) : null;
    const row = db && actor ? await db.prepare('SELECT user_id AS accountId FROM d1_social_actors WHERE token_hash=?')
      .bind(actor.hash).first<{ accountId: string }>() : null;
    const reader = db ? row : await getDiscoveryReader();
    if (!reader) return NextResponse.json({ error: 'Entre para salvar seus fandoms.' }, { status: 401, headers: privateHeaders });
    if (request.headers.get('X-Discovery-Account') !== reader.accountId) return NextResponse.json({ error: 'Sua conta mudou. Reabra esta página.' }, { status: 409, headers: privateHeaders });
    const raw = await request.text();
    let body;
    try { body = raw.length <= 8000 ? JSON.parse(raw) : null; } catch { body = null; }
    const fandoms = favoriteFandoms(body?.favorite_fandoms);
    if (!fandoms || Object.keys(body).some(k => k !== 'favorite_fandoms')) return NextResponse.json({ error: 'Escolha até 30 fandoms com no máximo 100 caracteres cada.' }, { status: 400, headers: privateHeaders });
    if (db && actor) {
      const saved = await db.prepare(`INSERT INTO discovery_preferences(user_id,favorite_fandoms)
        SELECT user_id,?2 FROM d1_social_actors WHERE token_hash=?1
        ON CONFLICT(user_id) DO UPDATE SET favorite_fandoms=excluded.favorite_fandoms,
          updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') RETURNING user_id`)
        .bind(actor.hash,JSON.stringify(fandoms)).first();
      if (!saved) throw new Error('Discovery preferences unavailable');
      return NextResponse.json({ saved: true, favorite_fandoms: fandoms }, { headers: privateHeaders });
    }
    const { error } = await discoveryDb.from('discovery_preferences').upsert({ user_id: reader.accountId, favorite_fandoms: fandoms, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw error;
    return NextResponse.json({ saved: true, favorite_fandoms: fandoms }, { headers: privateHeaders });
  } catch { return NextResponse.json({ error: 'Não foi possível salvar. Suas escolhas ainda não foram sincronizadas.' }, { status: 503, headers: privateHeaders }); }
}
