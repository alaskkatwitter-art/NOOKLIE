import { communityContext,communityFailure,CommunityError,jsonBody,reply,requireUuid } from '@/lib/community/http';
import { serviceCategories,serviceStates,shortText,httpsUrl } from '@/lib/community/options';
export async function GET(request:Request){try{
 const {repo,hash,actor}=await communityContext(request);const [providers,mine,requests]=await Promise.all([repo.providers(hash),actor?repo.myProvider(hash!):null,actor?repo.requests(hash!):[]]);
 return reply({providers,mine,requests,viewer:actor?.profile_id??null});
}catch(e){return communityFailure(e);}}
export async function POST(request:Request){try{
 const {repo,hash}=await communityContext(request,true);const b=await jsonBody(request);let saved=false;
 if(b.action==='profile'){
  let headline,bio,contact,portfolio;
  try{headline=shortText(b.headline,3,100);bio=shortText(b.bio??'',0,3000);contact=httpsUrl(b.contact);
   if(!Array.isArray(b.portfolio)||b.portfolio.length>8)throw Error('Adicione até 8 trabalhos.');
   portfolio=b.portfolio.map((p:Record<string,unknown>)=>{if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Confira os trabalhos do portfólio.');return {title:shortText(p.title,1,100),url:httpsUrl(p.url,false),image:httpsUrl(p.image)};});
  }catch(e){throw new CommunityError((e as Error).message);}
  if(!Array.isArray(b.categories)||!b.categories.length||b.categories.length>7||b.categories.some((c:unknown)=>typeof c!=='string'||!Object.hasOwn(serviceCategories,c)))throw new CommunityError('Selecione pelo menos uma categoria.');
  if(typeof b.availability!=='string'||!Object.hasOwn(serviceStates,b.availability))throw new CommunityError('Selecione uma disponibilidade.');
  if(b.availability==='external'&&!contact)throw new CommunityError('Informe o contato externo para pedidos pagos.');
  saved=await repo.saveProvider(hash!,{headline,bio,categories:[...new Set<string>(b.categories)],availability:b.availability,contact,portfolio});
 }else if(b.action==='request'){
  if(typeof b.category!=='string'||!Object.hasOwn(serviceCategories,b.category))throw new CommunityError('Categoria inválida.');
  let title,brief;try{title=shortText(b.title,3,120);brief=shortText(b.brief,10,3000);}catch(e){throw new CommunityError((e as Error).message);}
  saved=await repo.createRequest(hash!,crypto.randomUUID(),{provider:requireUuid(b.provider),category:b.category,title,brief});
 }else if(b.action==='status'){
  if(!['accepted','declined','completed','cancelled'].includes(b.status))throw new CommunityError('Situação inválida.');
  saved=await repo.updateRequest(hash!,requireUuid(b.id),b.status);
 }else throw new CommunityError('Ação inválida.');
 if(!saved)throw new CommunityError('Pedido indisponível, já em andamento ou sem permissão para esta ação.',409);
 return reply({ok:true});
}catch(e){return communityFailure(e);}}
