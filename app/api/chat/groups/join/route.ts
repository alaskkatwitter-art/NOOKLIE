import { getSessionTokenHash } from '@/lib/auth/session';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1Auth } from '@/lib/database/d1-auth';
import { d1Chat } from '@/lib/database/d1-chat';
import { chatCipherVersion } from '@/lib/chat/crypto';
import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { chatActor, chatDb, sameOrigin, privateHeaders } from '@/lib/chat/server';
function digest(token: unknown) { return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? createHash('sha256').update(token).digest('hex') : null; }
export async function GET(request: Request) {
  const hash = digest(new URL(request.url).searchParams.get('token'));
  if (!hash) return new NextResponse(null,{status:404,headers:privateHeaders});
  const db = getD1PreviewDatabase('auth');
  if (db) {
    try {
      const group = await d1Chat(db,chatCipherVersion()).linkInfo(hash);
      return group ? NextResponse.json({group},{headers:privateHeaders})
        : NextResponse.json({error:'Este convite expirou ou foi revogado.'},{status:404,headers:privateHeaders});
    } catch { return new NextResponse(null,{status:503,headers:privateHeaders}); }
  }
  const result = await chatDb.rpc('chat_group_link_info',{p_token_hash:hash});
  if (result.error) return new NextResponse(null,{status:503,headers:privateHeaders});
  if (!result.data) return NextResponse.json({error:'Este convite expirou ou foi revogado.'},{status:404,headers:privateHeaders});
  return NextResponse.json({group:result.data},{headers:privateHeaders});
}
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return new NextResponse(null,{status:403});
    const db = getD1PreviewDatabase('auth');
    const sessionTokenHash = db ? await getSessionTokenHash() : null;
    const session = db && sessionTokenHash ? await db.prepare('SELECT profile_id FROM d1_social_actors WHERE token_hash=?')
      .bind(sessionTokenHash).first<{profile_id:string}>() : null;
    const actor = db ? session && sessionTokenHash && {profileId:session.profile_id,sessionTokenHash} : await chatActor();
    if (!actor) return new NextResponse(null,{status:401,headers:privateHeaders});
    const raw = await request.text();
    if (raw.length > 200) return new NextResponse(null,{status:400});
    const hash = digest(JSON.parse(raw).token);
    if (!hash) return new NextResponse(null,{status:400});
    const rateKey = createHash('sha256').update('group-join:'+actor.profileId).digest('hex');
    const rate = db ? {data:await d1Auth(db).consumeRateLimit(rateKey,40,3600),error:null}
      : await chatDb.rpc('consume_auth_rate_limit',{p_key_hash:rateKey,p_limit:40,p_window_seconds:3600});
    if (rate.error || rate.data !== true) return new NextResponse(null,{status:429,headers:privateHeaders});
    if (db) {
      let joined;
      try { joined = await d1Chat(db,chatCipherVersion()).joinLink(actor.sessionTokenHash,hash); } catch {}
      return joined ? NextResponse.json(joined,{headers:privateHeaders})
        : NextResponse.json({error:'O convite não está disponível.'},{status:409,headers:privateHeaders});
    }
    const result = await chatDb.rpc('chat_group_link_join',{p_session:actor.sessionTokenHash,p_token_hash:hash});
    if (result.error) throw result.error;
    if (!result.data) return NextResponse.json({error:'O convite não está disponível. O link pode ter expirado, o grupo pode estar cheio ou existir um bloqueio.'},{status:409,headers:privateHeaders});
    return NextResponse.json({thread_id:result.data},{headers:privateHeaders});
  } catch { return NextResponse.json({error:'Não foi possível entrar no grupo.'},{status:503,headers:privateHeaders}); }
}
