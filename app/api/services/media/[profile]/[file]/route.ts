import { getD1PreviewDatabase } from '@/lib/database/preview';
import { getSessionTokenHash } from '@/lib/auth/session';
import { d1FollowState } from '@/lib/database/d1-follow-http';
import { getMediaBucket } from '@/lib/media/r2-binding';
import { portfolioMediaPath } from '@/lib/community/portfolio';
import { communityHeaders } from '@/lib/community/http';

type Context={params:Promise<{profile:string;file:string}>};
export async function GET(_request:Request,{params}:Context){
 const unavailable=()=>new Response(null,{status:404,headers:communityHeaders});
 try{
  const {profile,file}=await params;
  if(!/^[0-9a-f-]{36}$/.test(profile))return unavailable();
  const url='/api/services/media/'+profile+'/'+file,path=portfolioMediaPath(url,profile);
  if(!path)return unavailable();
  const db=getD1PreviewDatabase('auth');if(!db)return unavailable();
  const access=await d1FollowState(db,await getSessionTokenHash(),profile);
  if(!access?.allowed)return unavailable();
  const row=await db.prepare('SELECT portfolio FROM service_profiles WHERE profile_id=?').bind(profile).first<{portfolio:string}>();
  if(!row||!JSON.parse(row.portfolio).some((item:{image?:string})=>item.image===url))return unavailable();
  const image=await getMediaBucket()?.get(path);if(!image)return unavailable();
  const ext=file.split('.').pop();
  return new Response(image.body,{headers:{...communityHeaders,'Content-Type':ext==='jpg'?'image/jpeg':'image/'+ext,
   'X-Content-Type-Options':'nosniff','Content-Disposition':'inline','Content-Security-Policy':"default-src 'none'; sandbox"}});
 }catch{return unavailable();}
}
