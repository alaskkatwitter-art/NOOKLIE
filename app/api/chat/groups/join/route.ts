import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { chatActor, chatDb, sameOrigin, privateHeaders } from '@/lib/chat/server';
function digest(token: unknown) { return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token) ? createHash('sha256').update(token).digest('hex') : null; }
export async function GET(request: Request) {
  const hash = digest(new URL(request.url).searchParams.get('token'));
  if (!hash) return new NextResponse(null,{status:404,headers:privateHeaders});
  const result = await chatDb.rpc('chat_group_link_info',{p_token_hash:hash});
  if (result.error) return new NextResponse(null,{status:503,headers:privateHeaders});
  if (!result.data) return NextResponse.json({error:'Este convite expirou ou foi revogado.'},{status:404,headers:privateHeaders});
  return NextResponse.json({group:result.data},{headers:privateHeaders});
}
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return new NextResponse(null,{status:403});
    const actor = await chatActor();
    if (!actor) return new NextResponse(null,{status:401,headers:privateHeaders});
    const raw = await request.text();
    if (raw.length > 200) return new NextResponse(null,{status:400});
    const hash = digest(JSON.parse(raw).token);
    if (!hash) return new NextResponse(null,{status:400});
    const rate = await chatDb.rpc('consume_auth_rate_limit',{p_key_hash:createHash('sha256').update('group-join:'+actor.profileId).digest('hex'),p_limit:40,p_window_seconds:3600});
    if (rate.error || rate.data !== true) return new NextResponse(null,{status:429,headers:privateHeaders});
    const result = await chatDb.rpc('chat_group_link_join',{p_session:actor.sessionTokenHash,p_token_hash:hash});
    if (result.error) throw result.error;
    if (!result.data) return NextResponse.json({error:'O convite não está disponível. O link pode ter expirado, o grupo pode estar cheio ou existir um bloqueio.'},{status:409,headers:privateHeaders});
    return NextResponse.json({thread_id:result.data},{headers:privateHeaders});
  } catch { return NextResponse.json({error:'Não foi possível entrar no grupo.'},{status:503,headers:privateHeaders}); }
}
