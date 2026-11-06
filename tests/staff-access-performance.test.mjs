import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';
const exports = {};
let queries=0;
const query={select(){return this;},eq(){return this;},async maybeSingle(){return {data:null,error:null};}};
const db={from(){queries++;return query;}};
const code=ts.transpileModule(readFileSync(new URL('../lib/admin/authorization.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','exports',code)(name=>{
 if(name==='@supabase/supabase-js')return {createClient:()=>db};
 if(name==='next/headers')return {cookies:async()=>({get:()=>undefined})};
 if(name==='crypto')return {};
 throw Error(name);
},exports);
test('ordinary readers do not trigger permission catalogue queries and staff still require a valid grant',async()=>{
 const reader={isPlatformAdmin:false,memberships:[]};
 for(const permission of ['admin.view','moderation.view','moderation.manage'])assert.equal(await exports.hasStaffPermission(reader,permission),false);
 assert.equal(queries,0);
 assert.equal(await exports.hasStaffPermission({...reader,isPlatformAdmin:true},'admin.view'),true);
 assert.equal(await exports.hasStaffPermission({...reader,memberships:[{role_id:'role',department_id:'department'}]},'admin.view'),false);
 assert.equal(queries,1);
});
