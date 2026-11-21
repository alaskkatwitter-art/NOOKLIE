import { communityContext,communityFailure,CommunityError,reply,requireUuid } from '@/lib/community/http';
import { serviceCategories,serviceStates,shortText,httpsUrl } from '@/lib/community/options';
import { serviceBody } from '@/lib/community/portfolio-upload';
import { portfolioImageTypes,portfolioImageMaxBytes,portfolioMediaPath } from '@/lib/community/portfolio';
import { getMediaBucket } from '@/lib/media/r2-binding';
import { imageMatchesType } from '@/lib/security/uploads';
import { optimizeUploadedImage } from '@/lib/media/optimize-upload';
export async function GET(request:Request){try{
 const {repo,hash,actor}=await communityContext(request);const [providers,mine,requests]=await Promise.all([repo.providers(hash),actor?repo.myProvider(hash!):null,actor?repo.requests(hash!):[]]);
 return reply({providers,mine,requests,viewer:actor?.profile_id??null});
}catch(e){return communityFailure(e);}}
export async function POST(request:Request){
 const uploaded:string[]=[];let committed=false;const bucket=getMediaBucket();
 try{
 const {repo,hash,actor}=await communityContext(request,true);const {body:b,files}=await serviceBody(request);let saved=false;
 if(b.action==='profile'){
  let headline,bio,contact,portfolio;
  try{headline=shortText(b.headline,3,100);bio=shortText(b.bio??'',0,3000);contact=httpsUrl(b.contact);
   if(!Array.isArray(b.portfolio)||b.portfolio.length>8)throw Error('Adicione até 8 trabalhos.');
   if([...files.keys()].some(i=>i>=b.portfolio.length))throw Error('Confira as fotos selecionadas.');
   portfolio=b.portfolio.map((p:Record<string,unknown>,i:number)=>{
    if(!p||typeof p!=='object'||Array.isArray(p))throw Error('Confira os trabalhos do portfólio.');
    const title=shortText(p.title,1,100),url=httpsUrl(p.url);
    const image=portfolioMediaPath(p.image,actor!.profile_id)?String(p.image):httpsUrl(p.image);
    if(!url&&!image&&!files.has(i))throw Error('Adicione uma foto da galeria ou um link para cada trabalho.');
    return {title,url,image};
   });
  }catch(e){throw new CommunityError((e as Error).message);}
  if(!Array.isArray(b.categories)||!b.categories.length||b.categories.length>7||b.categories.some((c:unknown)=>typeof c!=='string'||!Object.hasOwn(serviceCategories,c)))throw new CommunityError('Selecione pelo menos uma categoria.');
  if(typeof b.availability!=='string'||!Object.hasOwn(serviceStates,b.availability))throw new CommunityError('Selecione uma disponibilidade.');
  if(b.availability==='external'&&!contact)throw new CommunityError('Informe o contato externo para pedidos pagos.');
  if(files.size&&!bucket)throw new CommunityError('O envio de fotos está temporariamente indisponível.',503);
  // Validate metadata before uploading; unsuccessful saves remove their newly stored objects.
  for(const [i,file] of files){
   if(!file.size||!Object.hasOwn(portfolioImageTypes,file.type))throw new CommunityError('Escolha uma foto JPG, PNG ou WebP.');
   if(file.size>portfolioImageMaxBytes)throw new CommunityError('Use fotos de até 3 MB cada.',413);
   const bytes=Buffer.from(await file.arrayBuffer());
   if(!imageMatchesType(bytes,file.type))throw new CommunityError('O arquivo não corresponde ao formato da imagem.',415);
   const name=crypto.randomUUID()+'.'+portfolioImageTypes[file.type];
   const path='service-portfolios/'+actor!.profile_id+'/'+name;
   uploaded.push(path);
   const stored=await bucket!.put(path,await optimizeUploadedImage(bytes,file.type,1600),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:file.type}});
   if(!stored)throw new CommunityError('Não foi possível salvar a foto. Tente novamente.',503);
   portfolio[i].image='/api/services/media/'+actor!.profile_id+'/'+name;
  }
  saved=await repo.saveProvider(hash!,{headline,bio,categories:[...new Set<string>(b.categories)],availability:b.availability,contact,portfolio});
  if(!saved)throw new CommunityError('Não foi possível salvar seu espaço.',409);
  committed=true;
  return reply({ok:true,portfolio});
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
}catch(e){return communityFailure(e);}finally{
 if(!committed&&uploaded.length)try{await bucket?.delete(uploaded);}catch{console.error('Portfolio upload cleanup failed');}
}}
