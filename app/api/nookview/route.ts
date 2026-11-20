import { communityContext,communityFailure,CommunityError,jsonBody,reply,requireUuid } from '@/lib/community/http';
import { readingStates,shortText } from '@/lib/community/options';
export async function GET(request:Request){try{
 const {repo,hash,actor}=await communityContext(request);const p=new URL(request.url).searchParams;
 const scope=p.get('scope')||'all';if(!['all','mine','favorites','following'].includes(scope))throw new CommunityError('Filtro inválido.');
 if(scope!=='all'&&!actor)throw new CommunityError('Entre para ver suas leituras.',401);
 const story=p.get('story')?requireUuid(p.get('story')):null;const page=Math.max(0,Math.min(100,Number(p.get('page'))||0));
 const [entries,stats]=await Promise.all([repo.entries(hash,scope,story,Math.floor(page)),actor?repo.stats(hash):null]);
 return reply({entries,stats,viewer:actor?.profile_id??null,hasMore:entries.length===25});
}catch(e){return communityFailure(e);}}
export async function POST(request:Request){try{
 const {repo,hash}=await communityContext(request,true);const b=await jsonBody(request);
 if(b.action==='like'){const id=requireUuid(b.id);if(typeof b.like!=='boolean')throw new CommunityError('Ação inválida.');if(!await repo.entry(hash,id))throw new CommunityError('Resenha indisponível.',404);await repo.likeEntry(hash!,id,b.like);return reply({ok:true});}
 const story=requireUuid(b.story);let body:string;try{body=shortText(b.body??'',0,8000);}catch(e){throw new CommunityError((e as Error).message);}
 const stars=b.stars===null||b.stars===''||b.stars===undefined?null:b.stars;
 if(stars!==null&&(typeof stars!=='number'||stars<0.5||stars>5||!Number.isInteger(stars*2)))throw new CommunityError('Escolha uma nota entre 0,5 e 5.');
 if(typeof b.status!=='string'||!Object.hasOwn(readingStates,b.status))throw new CommunityError('Escolha uma situação de leitura.');
 for(const key of ['favorite','spoiler','public'])if(typeof b[key]!=='boolean')throw new CommunityError('Confira as opções da resenha.');
 const readOn=b.readOn||null;if(readOn&&(typeof readOn!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(readOn)||Number.isNaN(Date.parse(readOn))||new Date(readOn).toISOString().slice(0,10)!==readOn||readOn>new Date().toISOString().slice(0,10)))throw new CommunityError('Informe uma data de leitura válida, até hoje.');
 const saved=await repo.saveEntry(hash!,crypto.randomUUID(),{story,body,stars,status:b.status,favorite:b.favorite,spoiler:b.spoiler,readOn,public:b.public});
 if(!saved)throw new CommunityError('História indisponível.',404);return reply({ok:true});
}catch(e){return communityFailure(e);}}
export async function DELETE(request:Request){try{const {repo,hash}=await communityContext(request,true);const b=await jsonBody(request);if(!await repo.deleteEntry(hash!,requireUuid(b.id)))throw new CommunityError('Registro indisponível.',404);return reply({ok:true});}catch(e){return communityFailure(e);}}
