import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
const exports={};new Function('exports',ts.transpileModule(readFileSync(new URL('../lib/images/crop.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports);
const {cropRect}=exports;
test('avatar and cover crops remain inside the source at every zoom and position',()=>{
 for(const [w,h] of [[1000,500],[500,1500],[400,400]])for(const aspect of [1,3])for(const zoom of [1,2,3])for(const x of [0,50,100])for(const y of [0,50,100]){
  const r=cropRect(w,h,aspect,zoom,x,y);assert.ok(r.sx>=-1e-8 && r.sy>=-1e-8);assert.ok(r.sx+r.sw<=w+1e-8 && r.sy+r.sh<=h+1e-8);assert.ok(Math.abs(r.sw/r.sh-aspect)<1e-8);
 }
 assert.deepEqual(cropRect(1000,500,1,1,50,50),{sx:250,sy:0,sw:500,sh:500});
 assert.ok(cropRect(1000,500,1,3,50,50).sw<cropRect(1000,500,1,1,50,50).sw);
 assert.throws(()=>cropRect(0,500,1,1,0,0));assert.throws(()=>cropRect(500,500,1,NaN,0,0));
});
