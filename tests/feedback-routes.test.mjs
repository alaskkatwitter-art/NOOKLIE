import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url);
function load(path,deps){const exports={};new Function('require','exports',ts.transpileModule(readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText)(name=>deps[name]||require(name),exports);return exports;}
const chapter='30000000-0000-0000-0000-000000000001',other='30000000-0000-0000-0000-000000000002',parent='30000000-0000-0000-0000-000000000003';
function comments({actor=true,visible=true,parentChapter=chapter}={}){
 const inserts=[];
 const db={from(table){const filters={};let inserted;const q={select(){return q;},eq(key,value){filters[key]=value;return q;},insert(row){inserted=row;inserts.push(row);return q;},async maybeSingle(){if(table==='chapters')return {data:{id:chapter,story_id:'story'},error:null};if(table==='comments')return {data:filters.id===parent&&filters.chapter_id===parentChapter?{id:parent}:null,error:null};return {data:null,error:null};},async single(){return{data:{id:'new',...inserted},error:null};}};return q;}};
 const route=load('app/api/comments/route.ts',{'@supabase/supabase-js':{createClient:()=>db},'@/lib/chat/server':{chatActor:async()=>actor?{profileId:'profile-not-account-id'}:null,uuid:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,privateHeaders:{'Cache-Control':'no-store'}},'@/lib/moderation/content-visibility':{isPublicStoryVisible:async()=>visible}});
 return {inserts,post:body=>route.POST(new Request('https://nooklie.vercel.app/api/comments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chapter_id:chapter,body:'Uma resposta',...body})}))};
}
test('chapter replies save the parent and use the authenticated profile identity',async()=>{const fixture=comments();const response=await fixture.post({parent_comment_id:parent});assert.equal(response.status,201);assert.equal(fixture.inserts[0].parent_comment_id,parent);assert.equal(fixture.inserts[0].user_id,'profile-not-account-id');assert.equal((await response.json()).comment.parent_comment_id,parent);});
test('a reply cannot target a comment in another chapter, bypass privacy, or be anonymous',async()=>{for(const [options,body,status] of [[{parentChapter:other},{parent_comment_id:parent},404],[{visible:false},{parent_comment_id:parent},404],[{actor:false},{},401],[{},{parent_comment_id:'bad-id'},400]]){const fixture=comments(options);assert.equal((await fixture.post(body)).status,status);assert.equal(fixture.inserts.length,0);}});
test('a normal chapter comment still posts without a parent',async()=>{const fixture=comments();assert.equal((await fixture.post({})).status,201);assert.equal(fixture.inserts[0].parent_comment_id,null);});

test('profile colors accept arbitrary six-digit hex, normalize case and reject CSS injection',async()=>{
 let saved,scope;
 const db={from(table){const q={select(){return q;},eq(key,value){if(table==='profiles')scope=[key,value];return q;},update(row){saved=row;return q;},async maybeSingle(){return{data:{user_id:'signed-in-account',expires_at:new Date(Date.now()+60000).toISOString()},error:null};},async single(){return{data:{theme_color:saved.theme_color},error:null};}};return q;}};
 const route=load('app/api/profile/update/route.ts',{'@supabase/supabase-js':{createClient:()=>db},'@/lib/profile/appearance':load('lib/profile/appearance.ts',{}),'@/lib/spotify/resolve':load('lib/spotify/resolve.ts',{'./link':load('lib/spotify/link.ts',{})})});
 const patch=color=>route.PATCH(new Request('https://nooklie.vercel.app/api/profile/update',{method:'PATCH',headers:{'Content-Type':'application/json',Cookie:'toriland_session=test-token'},body:JSON.stringify({theme_color:color,user_id:'foreign-account'})}));
 assert.equal((await patch('#B91234')).status,200);assert.equal(saved.theme_color,'#b91234');assert.deepEqual(scope,['user_id','signed-in-account']);
 for(const bad of ['red','#fff','#12345678','url(evil)','#ff0000;display:none',null,5])assert.equal((await patch(bad)).status,400);
});
