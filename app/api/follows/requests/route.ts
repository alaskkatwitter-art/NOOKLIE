import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1FollowActor } from '@/lib/database/d1-follow-http';
import { d1Social } from '@/lib/database/d1-social';
import{NextResponse}from'next/server';import{chatActor,chatDb,uuid,privateHeaders,sameOrigin}from'@/lib/chat/server';
export async function GET(){try{const db=getD1PreviewDatabase('auth');
if(db){
  const actor=await d1FollowActor(db);
  if(!actor)return new NextResponse(null,{status:401});
  const rows=await db.prepare(`SELECT r.requester_id,r.created_at,p.id,p.username,p.display_name,p.avatar_url,p.verified,p.is_official
    FROM follow_requests r JOIN profiles p ON p.id=r.requester_id AND p.moderation_hidden_at IS NULL
    JOIN auth_accounts a ON a.id=p.user_id AND a.account_status='active'
    JOIN d1_social_actors v ON v.profile_id=r.target_id WHERE v.token_hash=?
    ORDER BY r.created_at DESC,r.requester_id LIMIT 100`).bind(actor.hash).all<{
      requester_id:string;created_at:string;verified:number;is_official:number;
    }>();
  if(!rows.success)throw Error('Unable to load follow requests');
  return NextResponse.json({requests:rows.results.map(({requester_id,created_at,verified,is_official,...profile})=>({
    requester_id,created_at,profile:{...profile,verified:Boolean(verified),is_official:Boolean(is_official)},
  }))},{headers:privateHeaders});
}
const a=await chatActor();if(!a)return new NextResponse(null,{status:401});const r=await chatDb.from('follow_requests').select('requester_id,created_at').eq('target_id',a.profileId).order('created_at',{ascending:false}).limit(100);if(r.error)throw r.error;const ids=(r.data||[]).map(x=>x.requester_id);const peers=ids.length?await chatDb.from('profiles').select('id,username,display_name,avatar_url, verified, is_official').in('id',ids):{data:[],error:null};if(peers.error)throw peers.error;return NextResponse.json({requests:(r.data||[]).map(x=>({...x,profile:peers.data?.find(p=>p.id===x.requester_id)}))},{headers:privateHeaders});}catch{return new NextResponse(null,{status:503});}}
export async function PATCH(r:Request){try{if(!sameOrigin(r))return new NextResponse(null,{status:403});const db=getD1PreviewDatabase('auth');
if(db){
  const actor=await d1FollowActor(db);
  if(!actor)return new NextResponse(null,{status:401});
  const raw=await r.text();
  const body=raw.length<=500?JSON.parse(raw):null;
  if(typeof body?.requester_id!=='string'||!uuid.test(body.requester_id)||!['accept','deny'].includes(body.action))return new NextResponse(null,{status:400});
  const social=d1Social(db);
  const result=body.action==='accept' ? await social.acceptFollow(actor.hash,body.requester_id) : await social.denyFollow(actor.hash,body.requester_id);
  return result ? NextResponse.json({updated:true},{headers:privateHeaders}) : new NextResponse(null,{status:409});
}
const a=await chatActor();if(!a)return new NextResponse(null,{status:401});const raw=await r.text();const b=raw.length<=500?JSON.parse(raw):null;if(!b||!uuid.test(b.requester_id||'')||!['accept','deny'].includes(b.action))return new NextResponse(null,{status:400});const result=await chatDb.rpc('social_follow',{p_session:a.sessionTokenHash,p_target:b.requester_id,p_action:b.action});if(result.error)throw result.error;return NextResponse.json({updated:true},{headers:privateHeaders});}catch{return new NextResponse(null,{status:409});}}
