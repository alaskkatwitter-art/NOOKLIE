import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {test} from 'node:test';
import ts from 'typescript';
const require=createRequire(import.meta.url),id=n=>'60000000-0000-0000-0000-'+String(n).padStart(12,'0');
const code=ts.transpileModule(readFileSync(new URL('../app/api/news/comments/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({viewer='viewer',moderator=false,allowed=true,rows=[],hidden=[]}={}){
 const writes=[],filters=[],rates=[];const hiddenIds=new Set(hidden);
 const db={from(table){assert.equal(table,'news_comments');const equal={},nulls=[];let insert,update,limit=100,or;
  const matching=()=>rows.filter(row=>Object.entries(equal).every(([key,value])=>row[key]===value)&&nulls.every(key=>row[key]==null));
  const q={select(){return q;},eq(key,value){equal[key]=value;return q;},is(key){nulls.push(key);return q;},order(){return q;},limit(n){limit=n;return q;},or(value){or=value;filters.push(value);return q;},insert(row){insert=row;writes.push({type:'insert',row});return q;},update(row){update=row;return q;},async maybeSingle(){return{data:matching()[0]||null,error:null};},async single(){return{data:{id:id(90),created_at:'2026-11-06T21:00:00Z',deleted_at:null,author:{id:viewer,username:'reader'},...insert},error:null};},then(resolve,reject){if(update){writes.push({type:'update',row:update,filters:equal});return Promise.resolve({error:null}).then(resolve,reject);}return Promise.resolve({data:matching().slice(0,limit),error:null}).then(resolve,reject);}};return q;},async rpc(name,args){rates.push({name,args});return{data:allowed,error:null};}};
 const exports={};new Function('require','exports',code)(name=>{
  if(name==='@/lib/chat/server')return{chatActor:async()=>viewer?{profileId:viewer,sessionTokenHash:'session'}:null,chatDb:db,privateHeaders:{'Cache-Control':'no-store, private',Vary:'Cookie'},uuid:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,sameOrigin:request=>!request.headers.get('origin')||request.headers.get('origin')===new URL(request.url).origin};
  if(name==='@/lib/moderation/content-visibility')return{getPublicProfileIds:async(_,ids,actor)=>{assert.equal(actor,viewer);return new Set(ids.filter(id=>!hiddenIds.has(id)));}};
  if(name==='@/lib/moderation/staff')return{moderationStaff:async()=>moderator?{}:null};
  if(name==='@/lib/security/rate-key')return{rateLimitKey:()=> 'a'.repeat(64)};
  if(name==='@/lib/news/articles')return{isNewsArticle:value=>['boas-vindas','originais','atualizacao-6-novembro-2026'].includes(value)};
  return require(name);
 },exports);
 const request=(method,body,origin)=>new Request('https://nooklie.vercel.app/api/news/comments',{method,headers:{'Content-Type':'application/json',...(origin?{Origin:origin}:{})},body:JSON.stringify({article:'boas-vindas',...body})});
 return{writes,filters,rates,get:query=>exports.GET(new Request('https://nooklie.vercel.app/api/news/comments?article=boas-vindas'+(query||''))),post:(body,origin)=>exports.POST(request('POST',body,origin)),remove:(body,origin)=>exports.DELETE(request('DELETE',body,origin))};
}
const row=(n,patch={})=>({id:id(n),article_slug:'boas-vindas',author_id:'viewer',body:'Comentário '+n,parent_id:null,created_at:'2026-11-06T20:00:00Z',deleted_at:null,author:{id:'viewer',username:'reader'},...patch});
test('news comments list is scoped to one article, preserves privacy and paginates by timestamp and ID',async()=>{
 const rows=Array.from({length:31},(_,i)=>row(31-i));rows[0]=row(31,{author_id:'hidden',body:'PRIVATE TEXT'});rows[1]=row(30,{deleted_at:'2026-11-06T21:00:00Z',body:'DELETED TEXT'});rows.push(row(99,{article_slug:'originais'}));
 const f=fixture({rows,hidden:['hidden']});const response=await f.get();assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private/);const text=await response.text();assert.ok(!text.includes('PRIVATE TEXT')&&!text.includes('DELETED TEXT'));const data=JSON.parse(text);assert.equal(data.comments.length,29);assert.equal(data.next_cursor.id,id(2));assert.ok(!data.comments.some(c=>c.id===id(99)));assert.equal(data.comments.find(c=>c.id===id(30)).deleted,true);
 await f.get('&cursor='+encodeURIComponent(JSON.stringify(data.next_cursor)));assert.match(f.filters[0],/created_at\.eq\.2026-11-06T20:00:00\.000Z,id\.lt\./);
 assert.equal((await f.get('&cursor='+encodeURIComponent('{"created_at":"bad","id":"injected"}'))).status,400);
});
test('publishing uses authenticated ownership, accepts a same-article reply and rejects invalid content',async()=>{
 const f=fixture({rows:[row(1)]});const response=await f.post({body:'  Uma resposta  ',parent_id:id(1),author_id:'forged'});assert.equal(response.status,201);assert.equal(f.writes[0].row.author_id,'viewer');assert.equal(f.writes[0].row.body,'Uma resposta');assert.equal(f.writes[0].row.parent_id,id(1));assert.equal(f.rates[0].args.p_limit,20);
 for(const body of ['', ' '.repeat(4),'x'.repeat(3001)])assert.equal((await fixture().post({body})).status,400);
 assert.equal((await fixture().post({article:'missing',body:'x'})).status,404);
});
test('anonymous writes, cross-site writes, unavailable parents and excessive posts are refused',async()=>{
 for(const [options,body,origin,status]of[[{viewer:null},{body:'x'},null,401],[{},{body:'x'},'https://foreign.example',403],[{rows:[row(1,{article_slug:'originais'})]},{body:'x',parent_id:id(1)},null,404],[{rows:[row(1,{author_id:'hidden'})],hidden:['hidden']},{body:'x',parent_id:id(1)},null,404],[{allowed:false},{body:'x'},null,429]]){
  const f=fixture(options);assert.equal((await f.post(body,origin)).status,status);assert.equal(f.writes.length,0);
 }
});
test('only owners and authorized moderators can remove comments, preserving other replies',async()=>{
 const own=fixture({rows:[row(1)]});assert.equal((await own.remove({id:id(1)})).status,200);assert.equal(own.writes[0].row.deleted_by,'viewer');assert.ok(own.writes[0].row.deleted_at);assert.equal(own.writes[0].row.body,undefined);
 const stranger=fixture({rows:[row(1,{author_id:'other'})]});assert.equal((await stranger.remove({id:id(1),author_id:'viewer'})).status,403);assert.equal(stranger.writes.length,0);
 const staff=fixture({moderator:true,rows:[row(1,{author_id:'other'})]});assert.equal((await staff.remove({id:id(1)})).status,200);
 assert.equal((await fixture({viewer:null}).remove({id:id(1)})).status,401);
 assert.equal((await fixture().remove({id:id(1)},'https://foreign.example')).status,403);
});
