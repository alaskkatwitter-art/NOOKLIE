import { getSessionTokenHash } from '@/lib/auth/session';
import { getD1PreviewDatabase } from '@/lib/database/preview';
import { d1Books } from '@/lib/database/d1-books';
import { safeChapterHtml } from '@/lib/security/html';
import { NextResponse } from 'next/server';
import { chatActor,chatDb,uuid,privateHeaders,sameOrigin } from '@/lib/chat/server';
import { isPublicStoryVisible } from '@/lib/moderation/content-visibility';
type Context={params:Promise<{id:string}>};
async function d1Favorite(id: string, toggle: boolean) {
  const db = getD1PreviewDatabase('auth');
  if (!db) return null;
  const hash = await getSessionTokenHash();
  const actor = hash && await db.prepare('SELECT 1 FROM d1_social_actors WHERE token_hash = ?').bind(hash).first();
  if (!hash || !actor) return toggle ? new NextResponse(null, { status: 401 })
    : NextResponse.json({ favorited: false }, { status: 401, headers: privateHeaders });
  const result = uuid.test(id) ? await d1Books(db, safeChapterHtml).chapterFavorite(hash, id, toggle) : null;
  return result ? NextResponse.json(result, { headers: privateHeaders })
    : new NextResponse(null, { status: 404, headers: privateHeaders });
}
async function available(id:string){if(!uuid.test(id))return false;const c=await chatDb.from('chapters').select('story_id,published').eq('id',id).maybeSingle();return !c.error&&c.data?.published&&await isPublicStoryVisible(chatDb,c.data.story_id);}
export async function GET(_:Request,{params}:Context){try{const d1=await d1Favorite((await params).id,false);if(d1)return d1;const actor=await chatActor();if(!actor)return NextResponse.json({favorited:false},{status:401});const {id}=await params;if(!(await available(id)))return new NextResponse(null,{status:404});const {data,error}=await chatDb.from('chapter_favorites').select('chapter_id').eq('chapter_id',id).eq('user_id',actor.profileId).maybeSingle();if(error)throw error;return NextResponse.json({favorited:Boolean(data)},{headers:privateHeaders});}catch{return new NextResponse(null,{status:503});}}
export async function POST(request:Request,{params}:Context){try{if(!sameOrigin(request))return new NextResponse(null,{status:403});const d1=await d1Favorite((await params).id,true);if(d1)return d1;const actor=await chatActor();if(!actor)return new NextResponse(null,{status:401});const {id}=await params;if(!(await available(id)))return new NextResponse(null,{status:404});const old=await chatDb.from('chapter_favorites').select('chapter_id').eq('chapter_id',id).eq('user_id',actor.profileId).maybeSingle();if(old.error)throw old.error;const result=old.data?await chatDb.from('chapter_favorites').delete().eq('chapter_id',id).eq('user_id',actor.profileId):await chatDb.from('chapter_favorites').insert({chapter_id:id,user_id:actor.profileId});if(result.error)throw result.error;return NextResponse.json({favorited:!old.data},{headers:privateHeaders});}catch{return new NextResponse(null,{status:503});}}
