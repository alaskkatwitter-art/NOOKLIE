import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const exports = {};
new Function('exports', ts.transpileModule(readFileSync(new URL('../lib/stories/tags.ts', import.meta.url),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports);
const { ensureCatalogTag, findCatalogTag } = exports;
function fixture({race=false,failed=false}={}) {
  const rows = [{id:'fantasy',name:'Fantasia',slug:'fantasy'},{id:'thriller',name:'Suspense',slug:'thriller'}];
  let inserts=0;
  const db={from(){let field,value,insert;const q={select(){return q;},ilike(f,v){field=f;value=v;return q;},eq(f,v){field=f;value=v;return q;},insert(row){insert=row;inserts++;return q;},async maybeSingle(){return {data:rows.find(r=>String(r[field]).toLowerCase()===value.toLowerCase())||null,error:null};},async single(){if(failed)return {data:null,error:{code:'08006'}};const row={id:'new',...insert};rows.push(row);return race?{data:null,error:{code:'23505'}}:{data:row,error:null};}};return q;}};
  return {db,rows,inserts:()=>inserts};
}
test('translated catalogue names reuse canonical slugs without inserting duplicates',async()=>{const f=fixture();for(const [name,id] of [['fantasia','fantasy'],['SUSPENSE','thriller'],['fantasy','fantasy']])assert.equal((await ensureCatalogTag(f.db,name,'genre','author')).id,id);assert.equal(f.inserts(),0);});
test('a concurrent insert resolves by name after the unique-constraint conflict',async()=>{const f=fixture({race:true});assert.equal((await ensureCatalogTag(f.db,'Aventura','genre','author')).id,'new');assert.equal(f.inserts(),1);});
test('database errors propagate instead of silently discarding story tags',async()=>{const f=fixture({failed:true});await assert.rejects(ensureCatalogTag(f.db,'Aventura','genre','author'),e=>e.code==='08006');});
test('tag name lookup escapes pattern characters and never interpolates a PostgREST filter',async()=>{let pattern;const db={from(){return{select(){return this;},ilike(_,p){pattern=p;return this;},maybeSingle(){return {data:{id:'found'},error:null};}};}};await findCatalogTag(db,'100%_real\\tag');assert.equal(pattern,'100\\%\\_real\\\\tag');});
