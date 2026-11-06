import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { chatActor, chatDb, sameOrigin, privateHeaders, uuid } from '@/lib/chat/server';

async function manage(request: Request) {
  try {
    if (!sameOrigin(request)) return new NextResponse(null,{status:403});
    const actor = await chatActor();
    if (!actor) return new NextResponse(null,{status:401});
    const raw = await request.text();
    if (raw.length > 1800) return new NextResponse(null,{status:400});
    const body = JSON.parse(raw);
    if (!uuid.test(body.thread_id || '')) return new NextResponse(null,{status:400});
    const rate = await chatDb.rpc('consume_auth_rate_limit',{p_key_hash:createHash('sha256').update('group-invite:'+actor.profileId).digest('hex'),p_limit:40,p_window_seconds:3600});
    if (rate.error || rate.data !== true) return NextResponse.json({error:'Aguarde antes de enviar mais convites.'},{status:429,headers:privateHeaders});
    if (request.method === 'PATCH') {
      if (!Array.isArray(body.usernames) || body.usernames.length < 1 || body.usernames.length > 14 || body.usernames.some((name:unknown) => typeof name !== 'string' || !/^[a-z0-9_]{3,30}$/.test(name))) return new NextResponse(null,{status:400});
      const names = [...new Set(body.usernames as string[])];
      const profiles = await chatDb.from('profiles').select('id').in('username',names).is('moderation_hidden_at',null);
      if (profiles.error) throw profiles.error;
      if (profiles.data?.length !== names.length) return NextResponse.json({error:'Confira os usernames. Um dos perfis não está disponível.'},{status:400,headers:privateHeaders});
      const result = await chatDb.rpc('chat_group_invite_members',{p_session:actor.sessionTokenHash,p_thread:body.thread_id,p_members:profiles.data.map(p=>p.id)});
      if (result.error) throw result.error;
      if (result.data !== true) return NextResponse.json({error:'Só quem administra o grupo pode convidar. Confira bloqueios e o limite de 15 pessoas, incluindo convites pendentes.'},{status:409,headers:privateHeaders});
      return NextResponse.json({success:true},{headers:privateHeaders});
    }
    const revoke = request.method === 'DELETE';
    const token = revoke ? null : randomBytes(32).toString('hex');
    const result = await chatDb.rpc('chat_group_link_manage',{p_session:actor.sessionTokenHash,p_thread:body.thread_id,p_token_hash:token ? createHash('sha256').update(token).digest('hex') : null,p_revoke:revoke});
    if (result.error) throw result.error;
    if (result.data !== true) return NextResponse.json({error:'Só quem administra o grupo pode gerenciar o link.'},{status:403,headers:privateHeaders});
    return NextResponse.json({success:true,url:token ? new URL('/chat/convite/'+token,process.env.NEXT_PUBLIC_SITE_URL || request.url).href : null},{headers:privateHeaders});
  } catch { return NextResponse.json({error:'Não foi possível atualizar os convites.'},{status:503,headers:privateHeaders}); }
}
export const POST = manage;
export const PATCH = manage;
export const DELETE = manage;
