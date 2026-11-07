import { NextResponse } from 'next/server';
import { discoveryDb, getDiscoveryReader, privateHeaders, uuid } from '@/lib/discovery/server';
import { getStaffContext } from '@/lib/admin/authorization';

export async function GET() {
  try {
    const [staff,reader]=await Promise.all([getStaffContext(),getDiscoveryReader()]);
    const canManage=Boolean(reader&&staff?.isPlatformAdmin);
    const now=new Date().toISOString();
    let query=discoveryDb.from('story_events').select('id,title,description,starts_at,ends_at,active').order('starts_at',{ascending:false}).limit(50);
    if(!canManage)query=query.eq('active',true).lte('starts_at',now).gt('ends_at',now);
    const {data,error}=await query;if(error)throw error;
    return NextResponse.json({events:data||[],can_manage:canManage},{headers:privateHeaders});
  }catch{return NextResponse.json({error:'Não foi possível carregar os eventos.'},{status:503,headers:privateHeaders});}
}

export async function POST(request:Request) {
  try {
    const reader=await getDiscoveryReader();if(!reader)return NextResponse.json({error:'Entre na sua conta.'},{status:401,headers:privateHeaders});
    const raw=await request.text();let body;try{body=raw.length<=5000?JSON.parse(raw):null;}catch{body=null;}
    if(!body)return NextResponse.json({error:'Dados inválidos.'},{status:400,headers:privateHeaders});
    if(body.action==='enter'){
      if(typeof body.event_id!=='string'||!uuid.test(body.event_id)||typeof body.story_id!=='string'||!uuid.test(body.story_id))return NextResponse.json({error:'Selecione o evento e uma obra sua.'},{status:400,headers:privateHeaders});
      const now=new Date().toISOString();
      const [event,story]=await Promise.all([
        discoveryDb.from('story_events').select('id').eq('id',body.event_id).eq('active',true).lte('starts_at',now).gt('ends_at',now).maybeSingle(),
        discoveryDb.from('released_stories').select('id').eq('id',body.story_id).eq('author_id',reader.profile.id).is('moderation_hidden_at',null).maybeSingle(),
      ]);
      if(event.error||story.error)throw event.error||story.error;
      if(!event.data||!story.data)return NextResponse.json({error:'Evento indisponível ou obra não pertence a esta conta.'},{status:403,headers:privateHeaders});
      const chapters=await discoveryDb.from('chapters').select('id').eq('story_id',body.story_id).eq('published',true).limit(1);
      if(chapters.error)throw chapters.error;
      if(!chapters.data?.length)return NextResponse.json({error:'Publique ao menos um capítulo antes de inscrever a obra.'},{status:400,headers:privateHeaders});
      const {error}=await discoveryDb.from('story_event_entries').upsert({event_id:body.event_id,story_id:body.story_id},{onConflict:'event_id,story_id',ignoreDuplicates:true});if(error)throw error;
      return NextResponse.json({saved:true},{headers:privateHeaders});
    }
    if(body.action!=='create')return NextResponse.json({error:'Ação inválida.'},{status:400,headers:privateHeaders});
    const staff=await getStaffContext();if(!staff?.isPlatformAdmin)return NextResponse.json({error:'Apenas a administração pode criar eventos.'},{status:403,headers:privateHeaders});
    if(typeof body.title!=='string'||!body.title.trim()||body.title.length>120||typeof body.description!=='string'||body.description.length>2000||typeof body.starts_at!=='string'||typeof body.ends_at!=='string'||!Number.isFinite(Date.parse(body.starts_at))||!Number.isFinite(Date.parse(body.ends_at))||Date.parse(body.ends_at)<=Date.parse(body.starts_at))return NextResponse.json({error:'Confira título, descrição e período do evento.'},{status:400,headers:privateHeaders});
    const {error}=await discoveryDb.from('story_events').insert({title:body.title.trim(),description:body.description.trim(),starts_at:new Date(body.starts_at).toISOString(),ends_at:new Date(body.ends_at).toISOString(),created_by:reader.accountId});if(error)throw error;
    return NextResponse.json({saved:true},{status:201,headers:privateHeaders});
  }catch{return NextResponse.json({error:'Não foi possível concluir a operação.'},{status:503,headers:privateHeaders});}
}

export async function PATCH(request:Request){
  try{
    if(!(await getDiscoveryReader()))return new NextResponse(null,{status:401,headers:privateHeaders});
    const staff=await getStaffContext();if(!staff?.isPlatformAdmin)return NextResponse.json({error:'Acesso restrito.'},{status:403,headers:privateHeaders});
    const raw=await request.text();const body=raw.length<=500?JSON.parse(raw):null;
    if(!body||typeof body.id!=='string'||!uuid.test(body.id)||typeof body.active!=='boolean')return new NextResponse(null,{status:400,headers:privateHeaders});
    const {error}=await discoveryDb.from('story_events').update({active:body.active}).eq('id',body.id);if(error)throw error;
    return NextResponse.json({saved:true},{headers:privateHeaders});
  }catch{return NextResponse.json({error:'Não foi possível atualizar o evento.'},{status:503,headers:privateHeaders});}
}
