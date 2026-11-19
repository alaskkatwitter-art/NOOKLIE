import { getSessionTokenHash } from '@/lib/auth/session';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1Auth } from '@/lib/database/d1-auth';
import { d1Chat } from '@/lib/database/d1-chat';
import { chatCipherVersion } from '@/lib/chat/crypto';
import { NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
import { chatActor, chatDb, sameOrigin, privateHeaders, uuid } from '@/lib/chat/server';

async function manage(request: Request) {
  try {
    if (!sameOrigin(request)) return new NextResponse(null,{status:403});
    const db = getD1PreviewDatabase('auth');
    const sessionTokenHash = db ? await getSessionTokenHash() : null;
    const session = db && sessionTokenHash ? await db.prepare('SELECT profile_id FROM d1_social_actors WHERE token_hash=?')
      .bind(sessionTokenHash).first<{profile_id:string}>() : null;
    const actor = db ? session && sessionTokenHash && {profileId:session.profile_id,sessionTokenHash} : await chatActor();
    if (!actor) return new NextResponse(null,{status:401});
    const raw = await request.text();
    if (raw.length > 1800) return new NextResponse(null,{status:400});
    const body = JSON.parse(raw);
    if (!uuid.test(body.thread_id || '')) return new NextResponse(null,{status:400});
    const rateKey = createHash('sha256').update('group-invite:'+actor.profileId).digest('hex');
    const rate = db ? {data:await d1Auth(db).consumeRateLimit(rateKey,40,3600),error:null}
      : await chatDb.rpc('consume_auth_rate_limit',{p_key_hash:rateKey,p_limit:40,p_window_seconds:3600});
    if (rate.error || rate.data !== true) return NextResponse.json({error:'Aguarde antes de enviar mais convites.'},{status:429,headers:privateHeaders});
    if (request.method === 'PATCH') {
      if (!Array.isArray(body.usernames) || body.usernames.length < 1 || body.usernames.length > 14 || body.usernames.some((name:unknown) => typeof name !== 'string' || !/^[a-z0-9_]{3,30}$/.test(name))) return new NextResponse(null,{status:400});
      const names = [...new Set(body.usernames as string[])];
      if (db) {
        const invited = await d1Chat(db,chatCipherVersion()).inviteUsernames(actor.sessionTokenHash,body.thread_id,names);
        return invited ? NextResponse.json({success:true},{headers:privateHeaders})
          : NextResponse.json({error:'Confira os participantes, bloqueios e o limite do grupo.'},{status:409,headers:privateHeaders});
      }
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
    if (db) {
      const chat = d1Chat(db,chatCipherVersion());
      if (token) {
        if (!await chat.link(actor.sessionTokenHash,body.thread_id,createHash('sha256').update(token).digest('hex'))) {
          return NextResponse.json({error:'Só quem administra o grupo pode gerenciar o link.'},{status:403,headers:privateHeaders});
        }
      } else {
        const thread = await db.prepare(`SELECT 1 FROM d1_chat_access WHERE token_hash=? AND id=? AND kind='group'
          AND initiator_id=actor_id AND member_status='accepted'`).bind(actor.sessionTokenHash,body.thread_id).first();
        if (!thread) return NextResponse.json({error:'Só quem administra o grupo pode gerenciar o link.'},{status:403,headers:privateHeaders});
        await chat.revokeLink(actor.sessionTokenHash,body.thread_id);
      }
      return NextResponse.json({success:true,url:token ? new URL('/chat/convite/'+token,request.url).href : null},{headers:privateHeaders});
    }
    const result = await chatDb.rpc('chat_group_link_manage',{p_session:actor.sessionTokenHash,p_thread:body.thread_id,p_token_hash:token ? createHash('sha256').update(token).digest('hex') : null,p_revoke:revoke});
    if (result.error) throw result.error;
    if (result.data !== true) return NextResponse.json({error:'Só quem administra o grupo pode gerenciar o link.'},{status:403,headers:privateHeaders});
    return NextResponse.json({success:true,url:token ? new URL('/chat/convite/'+token,process.env.NEXT_PUBLIC_SITE_URL || request.url).href : null},{headers:privateHeaders});
  } catch { return NextResponse.json({error:'Não foi possível atualizar os convites.'},{status:503,headers:privateHeaders}); }
}
export const POST = manage;
export const PATCH = manage;
export const DELETE = manage;
