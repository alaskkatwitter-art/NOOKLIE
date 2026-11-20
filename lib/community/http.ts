import { getD1PreviewDatabase } from '@/lib/database/preview';
import { getSessionTokenHash } from '@/lib/auth/session';
import { d1Community } from '@/lib/database/d1-community';
import { d1Auth } from '@/lib/database/d1-auth';
import { rateLimitKey } from '@/lib/security/rate-key';
export const communityHeaders = {'Cache-Control':'no-store, private',Vary:'Cookie'};
export const reply = (data:object,status=200)=>Response.json(data,{status,headers:communityHeaders});
export class CommunityError extends Error {constructor(message:string,public status=400){super(message);}}
export async function communityContext(request:Request,write=false){
 if(write){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new CommunityError('Acesso restrito.',403);}
 const db=getD1PreviewDatabase('auth');if(!db)throw new CommunityError('Recurso temporariamente indisponível.',503);
 const hash=await getSessionTokenHash();const repo=d1Community(db);const actor=await repo.actor(hash);
 if(write){if(!hash||!actor)throw new CommunityError('Entre na sua conta para continuar.',401);
 if(!await d1Auth(db).consumeRateLimit(rateLimitKey('community',actor.profile_id),60,3600))throw new CommunityError('Muitas ações. Aguarde um pouco.',429);}
 return {db,repo,hash,actor};
}
export async function jsonBody(request:Request){const text=await request.text();if(text.length>24000)throw new CommunityError('Conteúdo muito grande.',413);try{const body=JSON.parse(text);if(!body||typeof body!=='object'||Array.isArray(body))throw Error();return body;}catch{throw new CommunityError('Confira os dados enviados.');}}
export function communityFailure(error:unknown){if(error instanceof CommunityError)return reply({error:error.message},error.status);console.error('community',error);return reply({error:'Não foi possível concluir. Tente novamente.'},503);}
export function requireUuid(value:unknown):string {if(typeof value!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw new CommunityError('Identificador inválido.');return value.toLowerCase();}
