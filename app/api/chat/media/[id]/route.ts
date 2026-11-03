import { chatActor,chatDb,allowedThread,privateHeaders,uuid } from '@/lib/chat/server';
import { decryptChat } from '@/lib/chat/crypto';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const actor=await chatActor();if(!actor)return new Response(null,{status:401,headers:privateHeaders});const {id}=await params;if(!uuid.test(id))return new Response(null,{status:404});
 const {data:message,error}=await chatDb.from('chat_messages').select('id,thread_id,media_path,media_type').eq('id',id).maybeSingle();if(error)throw error;
 if(!message?.media_path)return new Response(null,{status:404});const thread=await allowedThread(actor.profileId,message.thread_id);if(!thread||thread.blocked||(thread.kind==='group'&&thread.status!=='accepted'))return new Response(null,{status:404,headers:privateHeaders});
 const file=await chatDb.storage.from('private-chat').download(message.media_path);if(file.error||!file.data)throw file.error;
 const bytes=decryptChat(Buffer.from(await file.data.arrayBuffer()),`${message.thread_id}:${message.id}:media`);
 const headers={...privateHeaders,'Content-Type':message.media_type,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Accept-Ranges':'bytes','Content-Disposition':'inline'};
 const range=request.headers.get('range');if(range){const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match)return new Response(null,{status:416,headers});const start=Number(match[1]);const end=match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;if(start>end||start>=bytes.length)return new Response(null,{status:416,headers});return new Response(new Uint8Array(bytes.subarray(start,end+1)),{status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':String(end-start+1)}});}
 return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Length':String(bytes.length)}});
}catch{return new Response(null,{status:503,headers:privateHeaders});}}
