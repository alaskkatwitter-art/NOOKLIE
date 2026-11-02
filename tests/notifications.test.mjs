import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source=await readFile(new URL('../lib/notifications/presentation.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {notificationHref}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));

test('notification actions allow internal destinations and reject external or disguised redirects',()=>{
  assert.equal(notificationHref('/inicio'),'/inicio');
  assert.equal(notificationHref('/oportunidades?status=approved#resultado'),'/oportunidades?status=approved#resultado');
  for(const value of [null,undefined,1,'','javascript:alert(1)','https://example.com','//example.com','/\\example.com','/\n/example.com'])assert.equal(notificationHref(value),null,String(value));
});
