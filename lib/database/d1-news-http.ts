import crypto from 'crypto';
import { getSessionTokenHash } from '@/lib/auth/session';
import { newsArticleSlugs,isNewsArticle } from '@/lib/news/articles';
import { d1News } from './d1-news';
import type { NooklieD1 } from './d1';
const headers={'Cache-Control':'no-store, private',Vary:'Cookie'};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function d1NewsHttp(request:Request,method:'GET'|'POST'|'DELETE',db:NooklieD1){
 const reply=(data:unknown,status=200)=>Response.json(data,{status,headers});
 try{
  const hash=await getSessionTokenHash();const news=d1News(db,newsArticleSlugs);
  const actor=hash?await db.prepare('SELECT profile_id FROM d1_social_actors WHERE token_hash=?').bind(hash).first<{profile_id:string}>():null;
  if(method==='GET'){
   const params=new URL(request.url).searchParams,article=params.get('article');if(!isNewsArticle(article))return reply({error:'Notícia não encontrada.'},404);
   let cursor:null|{createdAt:string;id:string}=null;const raw=params.get('cursor');
   if(raw){if(raw.length>300)return reply({error:'Página inválida.'},400);try{const c=JSON.parse(raw);if(!c||typeof c.created_at!=='string'||!Number.isFinite(Date.parse(c.created_at))||!uuid.test(c.id??''))throw Error();cursor={createdAt:c.created_at,id:c.id};}catch{return reply({error:'Página inválida.'},400);}}
   const all=await news.comments(hash,article,31,cursor),rows=all.slice(0,30),last=rows.at(-1);
   const staff=hash?await db.prepare('SELECT user_id FROM d1_news_moderators WHERE token_hash=?').bind(hash).first():null;
   return reply({comments:rows.reverse().map(c=>({id:c.id,body:c.body,parent_id:c.parent_id,created_at:c.created_at,deleted:Boolean(c.deleted),author:c.deleted?null:{id:c.author_id,username:c.username,display_name:c.display_name,avatar_url:c.avatar_url,verified:Boolean(c.verified),is_official:Boolean(c.is_official)},can_delete:Boolean(c.can_delete)})),next_cursor:all.length>30&&last?{created_at:last.created_at,id:last.id}:null,viewer_id:actor?.profile_id??null,can_moderate:Boolean(staff)});
  }
  const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return reply({error:'Origem não permitida.'},403);
  if(!actor||!hash)return reply({error:'Entre na sua conta.'},401);
  const raw=await request.text();if(raw.length>(method==='DELETE'?500:20000))return reply({error:'Dados muito longos.'},400);
  let input;try{input=JSON.parse(raw);}catch{return reply({error:'Dados inválidos.'},400);}
  if(!input||!isNewsArticle(input.article))return reply({error:'Notícia não encontrada.'},404);
  if(method==='DELETE'){
   if(!uuid.test(input.id??''))return reply({error:'Comentário inválido.'},400);
   await news.remove(hash,crypto.randomUUID(),input.article,input.id);return reply({success:true});
  }
  if(typeof input.body!=='string'||!input.body.trim()||input.body.trim().length>3000||(input.parent_id!=null&&!uuid.test(input.parent_id)))return reply({error:'Comentário inválido.'},400);
  const id=crypto.randomUUID();await news.post(hash,id,input.article,input.body,input.parent_id??null);
  const row=await db.prepare('SELECT c.id,c.body,c.parent_id,c.created_at,p.id AS author_id,p.username,p.display_name,p.avatar_url,p.verified,p.is_official FROM news_comments c JOIN profiles p ON p.id=c.author_id JOIN d1_social_actors a ON a.profile_id=p.id WHERE c.id=? AND a.token_hash=?').bind(id,hash).first<Record<string,unknown>>();if(!row)throw Error('Created comment unavailable');
  return reply({comment:{id:row.id,body:row.body,parent_id:row.parent_id,created_at:row.created_at,deleted:false,author:{id:row.author_id,username:row.username,display_name:row.display_name,avatar_url:row.avatar_url,verified:Boolean(row.verified),is_official:Boolean(row.is_official)},can_delete:true}},201);
 }catch(error){if(error instanceof Error&&error.message.includes('News comment rate limit'))return Response.json({error:'Aguarde um pouco antes de enviar outro comentário.'},{status:429,headers:{...headers,'Retry-After':'900'}});if(error instanceof Error&&error.message.includes('Reply target unavailable'))return reply({error:'O comentário original não está disponível.'},404);if(error instanceof Error&&error.message.includes('Comment removal forbidden'))return reply({error:'Você não pode remover este comentário.'},403);return reply({error:'Não foi possível concluir a operação.'},503);}
}
