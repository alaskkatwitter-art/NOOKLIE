import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { d1Reader } from '@/lib/database/d1-reader';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { isReaderPreferences } from '@/lib/reader/preferences';

const supabase = createClient(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!);
const headers = { 'Cache-Control': 'no-store, private', Vary: 'Cookie' };

export async function GET() {
  let userId: string | null = null;
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta para sincronizar a leitura.' }, { status: 401, headers });
    userId = user.userId;
    const db = getD1PreviewDatabase('auth');
    if (db) {
      const preferences = await d1Reader(db, isReaderPreferences).preferences(user.sessionTokenHash);
      return NextResponse.json({ user_id: user.userId, preferences }, { headers });
    }
    const { data, error } = await supabase.from('reader_preferences').select('preferences').eq('user_id', user.userId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ user_id: user.userId, preferences: isReaderPreferences(data?.preferences) ? data.preferences : null }, { headers });
  } catch {
    return NextResponse.json({ error: 'A sincronização de leitura está indisponível.', user_id: userId }, { status: 503, headers });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta para sincronizar a leitura.' }, { status: 401, headers });
    if (request.headers.has('X-Reader-Account') && request.headers.get('X-Reader-Account') !== user.userId) {
      return NextResponse.json({ error: 'A conta mudou. Reabra as opções de leitura.' }, { status: 409, headers });
    }
    const raw = await request.text();
    let preferences: unknown;
    try { preferences = raw.length <= 2048 ? JSON.parse(raw) : null; } catch { preferences = null; }
    if (!isReaderPreferences(preferences)) return NextResponse.json({ error: 'Confira as opções de leitura.' }, { status: 400, headers });
    const db = getD1PreviewDatabase('auth');
    if (db) {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) {
        return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers });
      }
      const saved = await d1Reader(db, isReaderPreferences).savePreferences(user.sessionTokenHash, preferences);
      if (!saved) return NextResponse.json({ error: 'Entre na sua conta para sincronizar a leitura.' }, { status: 401, headers });
      return NextResponse.json({ saved: true, preferences }, { headers });
    }
    const { error } = await supabase.from('reader_preferences').upsert({ user_id: user.userId, preferences, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw error;
    return NextResponse.json({ saved: true, preferences }, { headers });
  } catch {
    return NextResponse.json({ error: 'Não foi possível sincronizar as preferências de leitura.' }, { status: 503, headers });
  }
}
