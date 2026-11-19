import { getD1PreviewDatabase } from '@/lib/database/preview';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: noStore });
    const summary = new URL(request.url).searchParams.get('summary') === '1';
    const db = getD1PreviewDatabase('auth');
    if (db) {
      const result = await db.prepare(`SELECT n.id,n.notification_type,n.title,n.body,n.href,n.created_at,n.read_at,n.actor_id,
        CASE WHEN p.id IS NULL THEN NULL ELSE json_object('id',p.id,'username',p.username,'display_name',p.display_name,'avatar_url',p.avatar_url) END AS actor
        FROM user_notifications n JOIN d1_social_actors a ON a.user_id=n.user_id
        LEFT JOIN profiles p ON p.id=n.actor_id AND p.moderation_hidden_at IS NULL
        WHERE a.token_hash=? ORDER BY n.created_at DESC,n.id DESC LIMIT 50`).bind(user.sessionTokenHash)
        .all<{read_at:string|null;actor:string|null}>();
      if (!result.success) throw Error('Unable to read notifications');
      const unread_count = result.results.filter(item => !item.read_at).length;
      return NextResponse.json(summary ? { unread_count } : {
        unread_count, notifications: result.results.map(row => ({ ...row, actor: row.actor ? JSON.parse(row.actor) : null })),
      }, { headers: noStore });
    }
    if (summary) {
      const { data, error } = await supabase.from('user_notifications')
        .select('read_at')
        .eq('user_id', user.userId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return NextResponse.json({
        unread_count: (data || []).filter(item => !item.read_at).length,
      }, { headers: noStore });
    }
    const { data, error } = await supabase.from('user_notifications')
      .select('id, notification_type, title, body, href, created_at, read_at, actor_id')
      .eq('user_id', user.userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    const ids=[...new Set((data||[]).map(n=>n.actor_id).filter(Boolean))];
    const actors=ids.length?await supabase.from('profiles').select('id,username,display_name,avatar_url').in('id',ids).is('moderation_hidden_at',null):{data:[],error:null};
    if(actors.error)throw actors.error;
    return NextResponse.json({
      notifications: (data||[]).map(n=>({...n,actor:(actors.data||[]).find(a=>a.id===n.actor_id)||null})),
      unread_count: (data || []).filter((item) => !item.read_at).length,
    }, { headers: noStore });
  } catch (error) {
    console.error('GET /api/notifications:', error);
    return NextResponse.json({ error: 'Não foi possível carregar as notificações.' }, { status: 500, headers: noStore });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: noStore });
    const body = await request.json();
    const db = getD1PreviewDatabase('auth');
    if (db) {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
      const id = body?.all === true ? null : body?.id ?? undefined;
      if (id !== null && typeof id !== 'string') return NextResponse.json({ error: 'Notificação inválida.' }, { status: 400, headers: noStore });
      const result = await db.prepare(`UPDATE user_notifications SET read_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE user_id=(SELECT user_id FROM d1_social_actors WHERE token_hash=?1)
        AND read_at IS NULL AND (?2 IS NULL OR id=?2)`).bind(user.sessionTokenHash,id).run();
      if (!result.success) throw Error('Unable to update notifications');
      return NextResponse.json({ updated: true }, { headers: noStore });
    }
    let query = supabase.from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.userId)
      .is('read_at', null);
    if (body?.all !== true) {
      if (typeof body?.id !== 'string') return NextResponse.json({ error: 'Notificação inválida.' }, { status: 400, headers: noStore });
      query = query.eq('id', body.id);
    }
    const { error } = await query;
    if (error) throw error;
    return NextResponse.json({ updated: true }, { headers: noStore });
  } catch (error) {
    console.error('PATCH /api/notifications:', error);
    return NextResponse.json({ error: 'Não foi possível atualizar a notificação.' }, { status: 500, headers: noStore });
  }
}
