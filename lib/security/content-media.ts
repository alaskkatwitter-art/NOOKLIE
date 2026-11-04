const buckets=new Set(['story-covers','stories','nook-media','chapter-media','social-stories']);
export function contentMediaUrl(value:string|null|undefined):string|undefined{
 if(!value)return undefined;try{const url=new URL(value);const configured=process.env.NEXT_PUBLIC_SUPABASE_URL;if(configured&&url.origin!==new URL(configured).origin)return value;const match=url.pathname.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);if(!match||!buckets.has(match[1]))return value;return '/api/content-media?bucket='+encodeURIComponent(match[1])+'&path='+encodeURIComponent(decodeURIComponent(match[2]));}catch{return value;}
}
