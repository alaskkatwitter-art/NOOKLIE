import { CommunityError,jsonBody } from '@/lib/community/http';
import { portfolioUploadMaxBytes } from '@/lib/community/portfolio';

// Bound the actual stream as well as Content-Length before parsing multipart data.
export async function serviceBody(request:Request) {
 if(!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data'))return {body:await jsonBody(request),files:new Map<number,File>()};
 const max=portfolioUploadMaxBytes+64*1024;
 if(Number(request.headers.get('content-length'))>max)throw new CommunityError('Envie no máximo 12 MB de fotos por vez.',413);
 const reader=request.body?.getReader();if(!reader)throw new CommunityError('Escolha uma imagem.');
 const chunks:BlobPart[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new CommunityError('Envie no máximo 12 MB de fotos por vez.',413);}chunks.push(value.slice().buffer);}}finally{reader.releaseLock();}
 let form:FormData;try{form=await new Response(new Blob(chunks),{headers:{'Content-Type':request.headers.get('content-type')!}}).formData();}catch{throw new CommunityError('Não foi possível ler as fotos enviadas.');}
 const raw=form.get('data');if(typeof raw!=='string'||raw.length>24000)throw new CommunityError('Confira os dados do portfólio.');
 let body;try{body=JSON.parse(raw);}catch{throw new CommunityError('Confira os dados do portfólio.');}
 if(!body||typeof body!=='object'||Array.isArray(body)||body.action!=='profile')throw new CommunityError('Envio de fotos disponível apenas para o portfólio.');
 const files=new Map<number,File>();
 for(const [key,value] of form.entries()){
  if(key==='data')continue;
  if(!/^image_[0-7]$/.test(key)||!(value instanceof File)||files.has(Number(key.slice(6))))throw new CommunityError('Confira as fotos selecionadas.');
  files.set(Number(key.slice(6)),value);
 }
 return {body,files};
}
