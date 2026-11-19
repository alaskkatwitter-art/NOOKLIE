import { getMediaBucket } from '@/lib/media/r2-binding';
import { getSessionTokenHash } from '@/lib/auth/session';
import { d1Chat } from '@/lib/database/d1-chat';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { mediaStorage } from '@/lib/media/storage';
import { chatActor,chatDb,allowedThread,privateHeaders,uuid } from '@/lib/chat/server';
import { chatCipherVersion, chatMediaBucket, chatMediaPath, decryptChat } from '@/lib/chat/crypto';
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const d1 = getD1PreviewDatabase('auth');
 const hash = d1 ? await getSessionTokenHash() : null;
 const actor = d1 ? null : await chatActor();
 if (!actor && !hash) return new Response(null, { status: 401, headers: privateHeaders });
 const { id } = await params;
 if (!uuid.test(id)) return new Response(null, { status: 404 });
 const { data: message, error } = d1 && hash
   ? { data: await d1Chat(d1, chatCipherVersion()).media(hash, id), error: null }
   : await chatDb.from('chat_messages').select('id,thread_id,media_path,media_type').eq('id',id).eq('cipher_version',chatCipherVersion()).maybeSingle();
 if (error) throw error;
 if (!message?.media_path || ((d1 || chatCipherVersion() === 2) && message.media_path !== chatMediaPath(message.thread_id, message.id))) {
   return new Response(null, { status: 404, headers: privateHeaders });
 }
 if (actor) {
   const thread = await allowedThread(actor.profileId, message.thread_id);
   if (!thread || thread.blocked || (thread.kind === 'group' && thread.status !== 'accepted')) {
     return new Response(null, { status: 404, headers: privateHeaders });
   }
 }
 let data: Blob;
 if (d1) {
   const bucket = getMediaBucket();
   if (!bucket) throw Error('Isolated R2 bucket unavailable');
   const stored = await bucket.get(`${chatMediaBucket}/${message.media_path}`);
   if (!stored) return new Response(null, { status: 404, headers: privateHeaders });
   data = await stored.blob();
 } else {
   const file = await mediaStorage(chatDb, chatMediaBucket).download(message.media_path);
   if (file.error || !file.data) throw file.error;
   data = file.data;
 }
 const bytes=decryptChat(Buffer.from(await data.arrayBuffer()),`${message.thread_id}:${message.id}:media`);
 const headers={...privateHeaders,'Content-Type':message.media_type,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Accept-Ranges':'bytes','Content-Disposition':'inline'};
 const range=request.headers.get('range');if(range){const match=/^bytes=(\d+)-(\d*)$/.exec(range);if(!match)return new Response(null,{status:416,headers});const start=Number(match[1]);const end=match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;if(start>end||start>=bytes.length)return new Response(null,{status:416,headers});return new Response(new Uint8Array(bytes.subarray(start,end+1)),{status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':String(end-start+1)}});}
 return new Response(new Uint8Array(bytes),{headers:{...headers,'Content-Length':String(bytes.length)}});
}catch{return new Response(null,{status:503,headers:privateHeaders});}}
