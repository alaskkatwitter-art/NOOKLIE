import { getAuthenticatedUserContext } from '@/lib/auth/session';
import { discoveryDb, privateHeaders, uuid } from '@/lib/discovery/server';
export { discoveryDb as chatDb, privateHeaders, uuid };
export async function chatActor(){
 const auth=await getAuthenticatedUserContext();if(!auth)return null;
 const {data,error}=await discoveryDb.rpc('social_actor',{p_session:auth.sessionTokenHash});if(error)throw error;if(!data)return null;
 return {...auth,profileId:data as string};
}
export async function allowedThread(actorId:string,threadId:string){
 if(!uuid.test(threadId))return null;
 const {data,error}=await discoveryDb.from('chat_threads').select('*').eq('id',threadId).or(`initiator_id.eq.${actorId},recipient_id.eq.${actorId}`).maybeSingle();if(error)throw error;
 if(!data)return null;
 const peer=data.initiator_id===actorId?data.recipient_id:data.initiator_id;
 const blocks=await discoveryDb.from('chat_blocks').select('blocker_id').or(`and(blocker_id.eq.${actorId},blocked_id.eq.${peer}),and(blocker_id.eq.${peer},blocked_id.eq.${actorId})`);
 if(blocks.error)throw blocks.error;
 return {...data,blocked:Boolean(blocks.data?.length),blocked_by_me:blocks.data?.some(b=>b.blocker_id===actorId)??false};
}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');return !origin || origin===new URL(request.url).origin;}
