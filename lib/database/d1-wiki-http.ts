import crypto from 'crypto';
import {getSessionTokenHash} from '@/lib/auth/session';
import {d1Wiki} from './d1-wiki';
import type {NooklieD1} from './d1';
const headers={'Cache-Control':'no-store, private',Vary:'Cookie'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function d1WikiHttp(request:Request,method:'GET'|'POST',db:NooklieD1){
 const reply=(data:unknown,status=200)=>Response.json(data,{status,headers});
 try{
  const hash=await getSessionTokenHash(),wiki=d1Wiki(db);
  const actor=hash?await db.prepare('SELECT profile_id FROM d1_social_actors WHERE token_hash=?').bind(hash).first():null;
  const canReview=hash?Boolean(await db.prepare('SELECT user_id FROM d1_wiki_reviewers WHERE token_hash=?').bind(hash).first()):false;
  if(method==='GET'){
   const params=new URL(request.url).searchParams,id=params.get('id');if(id&&!uuid.test(id))return reply({error:'Personagem indisponível.'},404);
   if(params.get('pending')==='1'){if(!canReview||!hash)return reply({error:'Acesso à revisão restrito à equipe.'},403);const edits=await wiki.pending(hash);return reply({edits:edits.map((e:unknown)=>{const r=e as Record<string,unknown>;return{id:r.id,biography:r.biography,source_url:r.source_url,wiki_characters:{name:r.name,universe:r.universe}};})});}
   const characters=await wiki.list(params.get('q')?.trim().slice(0,100)??'',id),favorites=actor&&hash?await wiki.favorites(hash):[];
   if(id&&!characters.length&&!favorites.some((r:unknown)=>(r as {id:string}).id===id))return reply({error:'Personagem indisponível.'},404);
   return reply({authenticated:Boolean(actor),characters,favorites,canReview:!id&&Boolean(actor&&canReview)});
  }
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return reply({error:'Origem não permitida.'},403);
  if(!actor||!hash)return reply({error:'Entre para participar da wiki.'},401);
  const raw=await request.text();if(raw.length>20000)return reply({error:'Dados muito longos.'},413);
  let body;try{body=JSON.parse(raw);}catch{return reply({error:'Dados inválidos.'},400);}
  if(!body||(body.id!=null&&(typeof body.id!=='string'||!uuid.test(body.id))))return reply({error:'Dados inválidos.'},400);
  if(body.action==='review'){
   if(!canReview)return reply({error:'Revisão restrita à equipe.'},403);
   if(!body.id||!['approved','rejected'].includes(body.decision))return reply({error:'Decisão inválida.'},400);
   await wiki.review(hash,crypto.randomUUID(),body.id,body.decision);return reply({ok:true});
  }
  if(body.action==='favorite'){
   if(!body.id||typeof body.enabled!=='boolean')return reply({error:'Dados inválidos.'},400);
   await wiki.favorite(hash,body.id,body.enabled);return reply({ok:true});
  }
  if(body.action!=='submit')return reply({error:'Ação inválida.'},400);
  try{const r=await wiki.submit(hash,crypto.randomUUID(),{characterId:body.id??null,name:body.name,universe:body.universe,biography:body.biography,source:body.source});return reply({id:r.characterId},201);}catch(error){if(error instanceof Error&&/Invalid text|Invalid URL|Source must/.test(error.message))return reply({error:'Confira a biografia e a fonte HTTPS.'},400);throw error;}
 }catch(error){if(error instanceof Error&&/already reviewed|Favorite required|UNIQUE constraint failed: wiki_characters/.test(error.message))return reply({error:'Sugestão indisponível, já revisada ou personagem já cadastrado.'},409);return reply({error:'Não foi possível concluir a operação.'},503);}
}
