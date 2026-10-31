import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);
const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: noStore });
    const { data, error } = await supabase.from('user_notifications')
      .select('id, notification_type, title, body, href, created_at, read_at')
      .eq('user_id', user.userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw error;
    return NextResponse.json({
      notifications: data || [],
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
