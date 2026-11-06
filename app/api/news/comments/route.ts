import { NextResponse } from 'next/server';
import { chatActor, chatDb as db, privateHeaders, sameOrigin, uuid } from '@/lib/chat/server';
import { getPublicProfileIds } from '@/lib/moderation/content-visibility';
import { moderationStaff } from '@/lib/moderation/staff';
import { rateLimitKey } from '@/lib/security/rate-key';
import { isNewsArticle } from '@/lib/news/articles';

const fields = 'id,article_slug,author_id,body,parent_id,created_at,deleted_at,author:profiles!news_comments_author_id_fkey(id,username,display_name,avatar_url,verified,is_official)';
function failure(message: string, status: number) { return NextResponse.json({error:message},{status,headers:privateHeaders}); }
function publishedComment(row: {id:string;body:string;parent_id:string|null;created_at:string;deleted_at:string|null;author_id:string;author:unknown}, viewer: string|null) {
  return {id:row.id,body:row.deleted_at ? null : row.body,parent_id:row.parent_id,created_at:row.created_at,deleted:Boolean(row.deleted_at),author:row.deleted_at ? null : row.author,can_delete:!row.deleted_at && row.author_id===viewer};
}
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const article = params.get('article');
    if (!isNewsArticle(article)) return failure('Notícia não encontrada.',404);
    const actor = await chatActor();
    let query = db.from('news_comments').select(fields).eq('article_slug',article).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(31);
    const rawCursor = params.get('cursor');
    if (rawCursor) {
      if (rawCursor.length>300) return failure('Página de comentários inválida.',400);
      let cursor;
      try { cursor=JSON.parse(rawCursor); } catch { return failure('Página de comentários inválida.',400); }
      if (!cursor || typeof cursor.created_at!=='string' || !Number.isFinite(Date.parse(cursor.created_at)) || !uuid.test(cursor.id || '')) return failure('Página de comentários inválida.',400);
      const date = new Date(cursor.created_at).toISOString();
      query=query.or(`created_at.lt.${date},and(created_at.eq.${date},id.lt.${cursor.id})`);
    }
    const result = await query;
    if (result.error) throw result.error;
    const rows = (result.data || []).slice(0,30);
    const [visible, staff] = await Promise.all([
      getPublicProfileIds(db,rows.map(row=>row.author_id),actor?.profileId || null),
      actor ? moderationStaff('moderation.manage') : Promise.resolve(null),
    ]);
    const last = rows.at(-1);
    return NextResponse.json({
      comments:rows.filter(row=>visible.has(row.author_id)).reverse().map(row=>publishedComment(row,actor?.profileId || null)),
      next_cursor:result.data && result.data.length>30 && last ? {created_at:last.created_at,id:last.id} : null,
      viewer_id:actor?.profileId || null,
      can_moderate:Boolean(staff),
    },{headers:privateHeaders});
  } catch { return failure('Não foi possível carregar os comentários. Tente novamente.',503); }
}
export async function POST(request: Request) {
  try {
    if (!sameOrigin(request)) return failure('Origem não permitida.',403);
    const actor = await chatActor();
    if (!actor) return failure('Entre na sua conta para comentar.',401);
    const raw = await request.text();
    if (raw.length>20000) return failure('O comentário é muito longo.',400);
    let input;
    try { input=JSON.parse(raw); } catch { return failure('Comentário inválido.',400); }
    if (!input || !isNewsArticle(input.article)) return failure('Notícia não encontrada.',404);
    if (typeof input.body!=='string' || !input.body.trim() || input.body.trim().length>3000) return failure('Escreva um comentário de até 3.000 caracteres.',400);
    const parent = input.parent_id ?? null;
    if (parent!==null && (typeof parent!=='string' || !uuid.test(parent))) return failure('Comentário de origem inválido.',400);
    if (parent) {
      const original=await db.from('news_comments').select('author_id').eq('id',parent).eq('article_slug',input.article).is('deleted_at',null).maybeSingle();
      if (original.error) throw original.error;
      if (!original.data || !(await getPublicProfileIds(db,[original.data.author_id],actor.profileId)).has(original.data.author_id)) return failure('O comentário original não está disponível nesta notícia.',404);
    }
    const rate=await db.rpc('consume_auth_rate_limit',{p_key_hash:rateLimitKey('news-comments',actor.profileId),p_limit:20,p_window_seconds:900});
    if (rate.error) throw rate.error;
    if (rate.data!==true) return NextResponse.json({error:'Aguarde um pouco antes de enviar outro comentário.'},{status:429,headers:{...privateHeaders,'Retry-After':'900'}});
    const result=await db.from('news_comments').insert({article_slug:input.article,author_id:actor.profileId,body:input.body.trim(),parent_id:parent}).select(fields).single();
    if (result.error || !result.data) throw result.error;
    return NextResponse.json({comment:publishedComment(result.data,actor.profileId)},{status:201,headers:privateHeaders});
  } catch { return failure('Não foi possível publicar seu comentário. Seu texto foi mantido para tentar novamente.',503); }
}
export async function DELETE(request: Request) {
  try {
    if (!sameOrigin(request)) return failure('Origem não permitida.',403);
    const actor=await chatActor();
    if (!actor) return failure('Entre na sua conta.',401);
    const raw=await request.text();
    if(raw.length>500) return failure('Comentário inválido.',400);
    let input;
    try { input=JSON.parse(raw); } catch { return failure('Comentário inválido.',400); }
    if (!input || !isNewsArticle(input.article) || !uuid.test(input.id || '')) return failure('Comentário inválido.',400);
    const original=await db.from('news_comments').select('author_id').eq('id',input.id).eq('article_slug',input.article).is('deleted_at',null).maybeSingle();
    if(original.error)throw original.error;
    if(!original.data)return failure('Comentário não encontrado.',404);
    if(original.data.author_id!==actor.profileId && !(await moderationStaff('moderation.manage')))return failure('Você não pode remover este comentário.',403);
    const result=await db.from('news_comments').update({deleted_at:new Date().toISOString(),deleted_by:actor.profileId}).eq('id',input.id).eq('article_slug',input.article).is('deleted_at',null);
    if(result.error)throw result.error;
    return NextResponse.json({success:true},{headers:privateHeaders});
  }catch{return failure('Não foi possível remover o comentário.',503);}
}
