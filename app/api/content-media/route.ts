import{discoveryDb as db,privateHeaders}from'@/lib/discovery/server';
import{currentViewerProfileId,isPublicProfileVisible,isPublicStoryVisible,isPublicPostVisible}from'@/lib/moderation/content-visibility';
export async function GET(request:Request){try{
 const params=new URL(request.url).searchParams,bucket=params.get('bucket')||'',path=params.get('path')||'';
 if(!['story-covers','stories','nook-media','chapter-media'].includes(bucket)||!path||path.length>1500||path.split('/').some(p=>p==='..'||p==='.')||/[\\\u0000]/.test(path))return new Response(null,{status:400,headers:privateHeaders});
 const original=(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL)+'/storage/v1/object/public/'+bucket+'/'+path.split('/').map(encodeURIComponent).join('/');
 const urls=[original,decodeURI(original)];const candidates=await Promise.all([
 bucket==='chapter-media'||bucket==='nook-media'?Promise.resolve({data:[],error:null}):db.from('stories').select('id,author_id').in('cover_url',urls).limit(10),
 bucket==='story-covers'||bucket==='nook-media'?Promise.resolve({data:[],error:null}):db.from('chapter_media').select('chapter_id').in('media_url',urls).limit(10),
 bucket==='story-covers'||bucket==='chapter-media'?Promise.resolve({data:[],error:null}):db.from('nook_post_media').select('post_id').in('media_url',urls).limit(10),
 bucket==='story-covers'||bucket==='chapter-media'?Promise.resolve({data:[],error:null}):db.from('nook_posts').select('id').in('image_url',urls).limit(10),
 bucket!=='stories'?Promise.resolve({data:[],error:null}):db.from('social_stories').select('user_id,expires_at').in('media_url',urls).gt('expires_at',new Date().toISOString()).limit(10),
 ]);for(const r of candidates)if(r.error)throw r.error;
 const viewer=await currentViewerProfileId(db);let allowed=false;
 for(const story of candidates[0].data||[]){if(story.author_id===viewer){allowed=true;break;}const published=await db.from('chapters').select('id').eq('story_id',story.id).eq('published',true).limit(1);if(published.error)throw published.error;if(published.data?.length&&await isPublicStoryVisible(db,story.id)){allowed=true;break;}}
 if(!allowed)for(const media of candidates[1].data||[]){const chapter=await db.from('chapters').select('story_id,published').eq('id',media.chapter_id).maybeSingle();if(chapter.error)throw chapter.error;if(!chapter.data)continue;const story=await db.from('stories').select('author_id').eq('id',chapter.data.story_id).maybeSingle();if(story.error)throw story.error;if(story.data?.author_id===viewer||(chapter.data.published&&await isPublicStoryVisible(db,chapter.data.story_id))){allowed=true;break;}}
 if(!allowed)for(const media of candidates[2].data||[])if(await isPublicPostVisible(db,media.post_id)){allowed=true;break;}
 if(!allowed)for(const post of candidates[3].data||[])if(await isPublicPostVisible(db,post.id)){allowed=true;break;}
 if(!allowed&&viewer)for(const story of candidates[4].data||[]){if(story.user_id===viewer){allowed=true;break;}const f=await db.from('follows').select('follower_id').eq('follower_id',viewer).eq('following_id',story.user_id).maybeSingle();if(f.error)throw f.error;if(f.data&&await isPublicProfileVisible(db,story.user_id,viewer)){allowed=true;break;}}
 if(!allowed)return new Response(null,{status:404,headers:privateHeaders});
 const file=await db.storage.from(bucket).download(path);if(file.error||!file.data)return new Response(null,{status:404,headers:privateHeaders});const type=file.data.type;if(!/^(image|audio|video)\//.test(type))return new Response(null,{status:415,headers:privateHeaders});
 const data=new Uint8Array(await file.data.arrayBuffer());const headers={'Content-Type':type,'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",...privateHeaders,'Accept-Ranges':'bytes'};const range=request.headers.get('range');if(range){const match=range.match(/^bytes=(\d+)-(\d*)$/);if(!match)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${data.length}`}});const start=Number(match[1]),end=Math.min(Number(match[2]||data.length-1),data.length-1);if(start>end||start>=data.length)return new Response(null,{status:416,headers:{...headers,'Content-Range':`bytes */${data.length}`}});return new Response(data.slice(start,end+1),{status:206,headers:{...headers,'Content-Range':`bytes ${start}-${end}/${data.length}`,'Content-Length':String(end-start+1)}});}
 return new Response(data,{headers:{...headers,'Content-Length':String(data.length)}});
 }catch{return new Response(null,{status:503,headers:privateHeaders});}}
