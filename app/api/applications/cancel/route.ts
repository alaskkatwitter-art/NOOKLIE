import { getD1PreviewDatabase } from '@/lib/database/preview';
import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUserContext } from '@/lib/auth/session';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUserContext();
    if (!user) return NextResponse.json({ error: 'Entre na sua conta.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const body = await request.json();
    if (typeof body?.application_id !== 'string') return NextResponse.json({ error: 'Candidatura inválida.' }, { status: 400 });
    const db = getD1PreviewDatabase('auth');
    if (db) {
      const origin = request.headers.get('origin');
      if (origin && origin!==new URL(request.url).origin) return NextResponse.json({error:'Acesso restrito.'},{status:403});
      const id = body.application_id;
      const hash = user.sessionTokenHash;
      const status = db.prepare(`UPDATE applications SET status='cancelled',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id=?1 AND status IN ('submitted','in_review')
        AND user_id=(SELECT user_id FROM d1_social_actors WHERE token_hash=?2)`).bind(id,hash);
      const audit = db.prepare(`INSERT INTO admin_audit_log(id,actor_user_id,action,subject_type,subject_id)
        SELECT ?1,user_id,'application.cancelled','application',?2 FROM d1_social_actors
        WHERE token_hash=?3 AND changes()=1`).bind(randomUUID(),id,hash);
      const result = await db.batch([status,audit]);
      if (result.some(row=>!row.success)) throw Error('Unable to cancel application');
      if (result[0].meta.changes) return NextResponse.json({cancelled:true},{headers:{'Cache-Control':'no-store'}});
      const match = await db.prepare(`SELECT x.id FROM applications x JOIN d1_social_actors a ON a.user_id=x.user_id
        WHERE x.id=? AND a.token_hash=?`).bind(id,hash).first();
      return match ? NextResponse.json({error:'Esta candidatura já não pode ser cancelada.'},{status:409})
        : NextResponse.json({error:'Candidatura não encontrada.'},{status:404});
    }
    const { error } = await supabase.rpc('cancel_own_application', {
      p_session_token_hash: user.sessionTokenHash,
      p_application_id: body.application_id,
    });
    if (error) {
      if (error.code === 'P0002') return NextResponse.json({ error: 'Candidatura não encontrada.' }, { status: 404 });
      if (error.code?.startsWith('22')) return NextResponse.json({ error: 'Esta candidatura já não pode ser cancelada.' }, { status: 409 });
      console.error('POST /api/applications/cancel:', error);
      return NextResponse.json({ error: 'Não foi possível cancelar a candidatura.' }, { status: 500 });
    }
    return NextResponse.json({ cancelled: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('POST /api/applications/cancel:', error);
    return NextResponse.json({ error: 'Não foi possível cancelar a candidatura.' }, { status: 500 });
  }
}
