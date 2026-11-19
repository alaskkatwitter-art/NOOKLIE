import { NextResponse } from 'next/server';
import { chatActor, chatDb, privateHeaders, sameOrigin } from '@/lib/chat/server';
import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { getD1PreviewDatabase } from '@/lib/database/preview';

const fields = ['is_private', 'social_notifications', 'chapter_notifications', 'reposts_private', 'video_autoplay'] as const;

export async function GET() {
  try {
    const db = getD1PreviewDatabase('auth');
    if (db) {
      const user = await getAuthenticatedUserContext();
      if (!user) return new NextResponse(null, { status: 401 });
      const data = await db.prepare(`SELECT ${fields.map(field => 'p.' + field).join(', ')}
        FROM profiles p JOIN d1_social_actors a ON a.profile_id=p.id WHERE a.token_hash=?`)
        .bind(user.sessionTokenHash).first<Record<typeof fields[number], number>>();
      if (!data) return new NextResponse(null,{status:401});
      return NextResponse.json(Object.fromEntries(fields.map(field=>[field,Boolean(data[field])])),{headers:privateHeaders});
    }
    const actor = await chatActor();
    if (!actor) return new NextResponse(null,{status:401});
    const {data,error} = await chatDb.from('profiles').select(fields.join(',')).eq('id',actor.profileId).single();
    if (error) throw error;
    return NextResponse.json(data,{headers:privateHeaders});
  } catch {
    return new NextResponse(null,{status:503});
  }
}

export async function PUT(request: Request) {
  try {
    if (!sameOrigin(request)) return new NextResponse(null,{status:403});
    const db = getD1PreviewDatabase('auth');
    const user = db ? await getAuthenticatedUserContext() : null;
    const actor = db ? null : await chatActor();
    if (!actor && !user) return new NextResponse(null,{status:401});
    const raw = await request.text();
    const body: Record<string,unknown> | null = raw.length<=1000 ? JSON.parse(raw) : null;
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some(key=>!fields.some(field=>field===key)) ||
        Object.values(body).some(value=>typeof value!=='boolean')) {
      return new NextResponse(null,{status:400});
    }
    if (db && user) {
      const selected = fields.filter(field=>Object.hasOwn(body,field));
      if (selected.length) {
        const saved = await db.prepare(`UPDATE profiles SET ${selected.map(field=>field+'=?').join(', ')}
          WHERE id=(SELECT profile_id FROM d1_social_actors WHERE token_hash=?) RETURNING id`)
          .bind(...selected.map(field=>Number(body[field])),user.sessionTokenHash).first();
        if (!saved) return new NextResponse(null,{status:401});
      }
    } else if (actor) {
      const {error} = await chatDb.from('profiles').update(body).eq('id',actor.profileId);
      if (error) throw error;
    }
    return NextResponse.json({saved:true},{headers:privateHeaders});
  } catch {
    return new NextResponse(null,{status:503});
  }
}
