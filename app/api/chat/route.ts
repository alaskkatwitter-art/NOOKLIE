import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { chatActor,chatDb,allowedThread,privateHeaders,uuid,sameOrigin } from '@/lib/chat/server';
import { encryptChat,decryptChat } from '@/lib/chat/crypto';
import { detectedMedia } from '@/lib/chat/safety';

export async function GET(request:Request){try{
 const actor=await chatActor();if(!actor)return NextResponse.json({error:'Entre para abrir seu chat.'},{status:401,headers:privateHeaders});
 const params=new URL(request.url).searchParams;const id=params.get('thread');
 if(!id){const result=await chatDb.from('chat_threads').select('*').or(`initiator_id.eq.${actor.profileId},recipient_id.eq.${actor.profileId}`).order('updated_at',{ascending:false}).limit(100);if(result.error)throw result.error;
 const ids=[...new Set((result.data||[]).flatMap(t=>[t.initiator_id,t.recipient_id]))];
 const peers=ids.length?await chatDb.from('profiles').select('id,username,display_name,avatar_url').in('id',ids):{data:[],error:null};if(peers.error)throw peers.error;
 const admin=await chatDb.from('platform_admins').select('user_id').eq('user_id',actor.userId).maybeSingle();if(admin.error)throw admin.error;
 return NextResponse.json({is_admin:Boolean(admin.data),me:actor.profileId,threads:(result.data||[]).map(t=>({...t,peer:peers.data?.find(p=>p.id===(t.initiator_id===actor.profileId?t.recipient_id:t.initiator_id))}))},{headers:privateHeaders});}
 const thread=await allowedThread(actor.profileId,id);if(!thread)return new NextResponse(null,{status:404,headers:privateHeaders});
 if(thread.blocked)return NextResponse.json({me:actor.profileId,thread,messages:[]},{headers:privateHeaders});
 let query=chatDb.from('chat_messages').select('id,thread_id,sender_id,body_cipher,media_type,reply_to,created_at,read_at').eq('thread_id',id).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(60);
 const before=params.get('before');if(before){if(!Number.isFinite(Date.parse(before)))return new NextResponse(null,{status:400});query=query.lt('created_at',before);}
 const result=await query;if(result.error)throw result.error;
 const messages=(result.data||[]).reverse().map(m=>({id:m.id,sender_id:m.sender_id,body:decryptChat(Buffer.from(m.body_cipher,'base64'),`${id}:${m.id}:body`).toString('utf8'),media_type:m.media_type,media_url:m.media_type?`/api/chat/media/${m.id}`:null,reply_to:m.reply_to,created_at:m.created_at,read_at:m.read_at}));
 const read=await chatDb.from('chat_messages').update({read_at:new Date().toISOString()}).eq('thread_id',id).neq('sender_id',actor.profileId).is('read_at',null);if(read.error)throw read.error;
 return NextResponse.json({me:actor.profileId,thread,messages,has_more:messages.length===60},{headers:privateHeaders});
}catch{return NextResponse.json({error:'O chat está temporariamente indisponível.'},{status:503,headers:privateHeaders});}}

export async function POST(request:Request){let uploaded='';try{
 if(!sameOrigin(request))return new NextResponse(null,{status:403});
 const actor=await chatActor();if(!actor)return new NextResponse(null,{status:401,headers:privateHeaders});
 const length=Number(request.headers.get('content-length')||0);if(length>4*1024*1024)return NextResponse.json({error:'Use arquivos de até 3 MB.'},{status:413,headers:privateHeaders});
 if((request.headers.get('content-type')||'').includes('application/json')){
 const raw=await request.text();if(raw.length>500)return new NextResponse(null,{status:400});const body=JSON.parse(raw);
 if(typeof body.target!=='string'||!uuid.test(body.target))return new NextResponse(null,{status:400});
 const {data,error}=await chatDb.rpc('chat_request',{p_session:actor.sessionTokenHash,p_target:body.target});if(error)return NextResponse.json({error:'Não foi possível solicitar esta conversa. Ela pode estar bloqueada ou você atingiu o limite de solicitações.'},{status:409,headers:privateHeaders});return NextResponse.json({thread_id:data},{headers:privateHeaders});
 }
 const form=await request.formData();const threadId=String(form.get('thread_id')||'');const text=String(form.get('body')||'').trim();const reply=form.get('reply_to');const file=form.get('file');
 if(text.length>4000||!uuid.test(threadId)||(reply&&!uuid.test(String(reply)))||(!text&&!(file instanceof File&&file.size>0)))return NextResponse.json({error:'Escreva uma mensagem de até 4000 caracteres ou escolha um arquivo.'},{status:400,headers:privateHeaders});
 const thread=await allowedThread(actor.profileId,threadId);if(!thread||thread.blocked||thread.status!=='accepted')return NextResponse.json({error:'A conversa precisa ser aceita e estar desbloqueada.'},{status:403,headers:privateHeaders});
 const id=randomUUID();let mediaType:string|null=null;
 if(file instanceof File&&file.size){if(file.size>3*1024*1024)return NextResponse.json({error:'O arquivo deve ter até 3 MB.'},{status:413,headers:privateHeaders});
 const bytes=Buffer.from(await file.arrayBuffer());mediaType=detectedMedia(bytes);
 if(!mediaType||!file.type.startsWith(mediaType.split('/')[0]+'/')||file.type.startsWith('video/'))return NextResponse.json({error:'Envie apenas imagens JPG, PNG ou WEBP, ou arquivos de áudio. Não são permitidos SVG, vídeos ou programas.'},{status:400,headers:privateHeaders});
 uploaded=`${threadId}/${id}.enc`;const upload=await chatDb.storage.from('private-chat').upload(uploaded,encryptChat(bytes,`${threadId}:${id}:media`),{contentType:'application/octet-stream',upsert:false});if(upload.error)throw upload.error;
 }
 const cipher=encryptChat(Buffer.from(text),`${threadId}:${id}:body`).toString('base64');
 const result=await chatDb.rpc('chat_send',{p_session:actor.sessionTokenHash,p_thread:threadId,p_id:id,p_cipher:cipher,p_reply:reply?String(reply):null,p_media_path:uploaded||null,p_media_type:mediaType});
 if(result.error||!result.data){if(uploaded)await chatDb.storage.from('private-chat').remove([uploaded]);return NextResponse.json({error:'Não foi possível enviar. Verifique se a conversa continua aceita ou aguarde um instante.'},{status:409,headers:privateHeaders});}
 return NextResponse.json({sent:true,id},{status:201,headers:privateHeaders});
}catch{if(uploaded)await chatDb.storage.from('private-chat').remove([uploaded]);return NextResponse.json({error:'Não foi possível enviar. Tente novamente.'},{status:503,headers:privateHeaders});}}

export async function PATCH(request:Request){try{
 if(!sameOrigin(request))return new NextResponse(null,{status:403});const actor=await chatActor();if(!actor)return new NextResponse(null,{status:401,headers:privateHeaders});
 const raw=await request.text();if(raw.length>500)return new NextResponse(null,{status:400});const body=JSON.parse(raw);
 if(!uuid.test(body.thread_id||'')||!['accept','deny','block','unblock'].includes(body.action))return new NextResponse(null,{status:400});
 const {data,error}=await chatDb.rpc('chat_action',{p_session:actor.sessionTokenHash,p_thread:body.thread_id,p_action:body.action});if(error||!data)return new NextResponse(null,{status:403,headers:privateHeaders});
 return NextResponse.json({updated:true},{headers:privateHeaders});
}catch{return new NextResponse(null,{status:503,headers:privateHeaders});}}
