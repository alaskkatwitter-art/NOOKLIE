import assert from 'node:assert/strict';import{test}from'node:test';import{readFileSync}from'node:fs';import{createRequire}from'node:module';import ts from'typescript';
const require=createRequire(import.meta.url);function load(p){const exports={};const js=ts.transpileModule(readFileSync(new URL('../'+p,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','exports',js)(require,exports);return exports;}
const crypto=load('lib/chat/crypto.ts'),safety=load('lib/chat/safety.ts'),html=load('lib/security/html.ts');
const media=load('lib/security/content-media.ts');
const rate=load('lib/security/rate-key.ts');
test('distributed rate limits receive the 64-character digest required by PostgreSQL',()=>{assert.match(rate.rateLimitKey('follow','actor'),/^[a-f0-9]{64}$/);assert.notEqual(rate.rateLimitKey('follow','actor'),rate.rateLimitKey('chat-report','actor'));assert.notEqual(rate.rateLimitKey('follow','actor'),rate.rateLimitKey('follow','other'));});
test('content images use an access-checked route while avatar and external links remain intact',()=>{const old=process.env.NEXT_PUBLIC_SUPABASE_URL;try{process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';assert.equal(media.contentMediaUrl('https://example.supabase.co/storage/v1/object/public/story-covers/author/a%20b.jpg'),'/api/content-media?bucket=story-covers&path=author%2Fa%20b.jpg');assert.equal(media.contentMediaUrl('https://example.supabase.co/storage/v1/object/public/avatars/person.jpg'),'https://example.supabase.co/storage/v1/object/public/avatars/person.jpg');assert.equal(media.contentMediaUrl('https://other.example/photo.jpg'),'https://other.example/photo.jpg');assert.equal(media.contentMediaUrl('blob:preview'),'blob:preview');}finally{if(old===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=old;}});
test('chat encryption authenticates message identity, rejects tampering and fails closed without its key',()=>{const old=process.env.CHAT_ENCRYPTION_KEY;try{process.env.CHAT_ENCRYPTION_KEY='ab'.repeat(32);const plain=Buffer.from('uma mensagem privada');const encrypted=crypto.encryptChat(plain,'thread:message:body');assert.ok(!encrypted.includes(plain));assert.equal(crypto.decryptChat(encrypted,'thread:message:body').toString(),plain.toString());assert.throws(()=>crypto.decryptChat(encrypted,'other:message:body'));const tampered=Buffer.from(encrypted);tampered[15]^=1;assert.throws(()=>crypto.decryptChat(tampered,'thread:message:body'));delete process.env.CHAT_ENCRYPTION_KEY;assert.throws(()=>crypto.encryptChat(plain,'aad'));}finally{if(old===undefined)delete process.env.CHAT_ENCRYPTION_KEY;else process.env.CHAT_ENCRYPTION_KEY=old;}});
test('support hints recognize Portuguese terms without exposing the message or automatically filing a report',()=>{for(const phrase of ['penso em suicídio','vou me matar','atentado contra a vida','tirar minha vida'])assert.equal(safety.needsSupport(phrase),true);assert.equal(safety.needsSupport('Adorei o capítulo!'),false);assert.equal(safety.cvvPhone,'tel:+55188?oai_link_source=model_response_hotline');});
test('media signature checking rejects HTML and SVG masquerading as images',()=>{for(const v of ['<svg onload=alert(1)>','<html><script>bad()</script>'])assert.equal(safety.detectedMedia(Buffer.from(v)),null);assert.equal(safety.detectedMedia(Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0])),'image/png');});
test('chapter sanitizer removes executable HTML while preserving prose and safe formatting',()=>{const result=html.safeChapterHtml('<p style="text-align:center" onclick=alert(1)>Oi <strong>leitor</strong></p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">link</a>');assert.ok(result.includes('<strong>leitor</strong>'));assert.ok(result.includes('text-align:center'));assert.ok(!/script|onclick|onerror|<img|javascript:/i.test(result));});

test('animated GIF signatures are accepted without relaxing SVG or executable checks',()=>{
 assert.equal(safety.detectedMedia(Buffer.from('GIF89a000000000000')),'image/gif');
 assert.equal(safety.detectedMedia(Buffer.from('GIF87a000000000000')),'image/gif');
 assert.equal(safety.detectedMedia(Buffer.from('GIF00a000000000000')),null);
});
test('inline chapter images preserve their position through repeated sanitization and reject remote tracking media',()=>{
 const old=process.env.NEXT_PUBLIC_SUPABASE_URL;try{
  process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';
  const input='<p>Antes</p><img src="https://example.supabase.co/storage/v1/object/public/chapter-media/author/chapter/image.png" data-media-id="image-id" onerror="alert(1)"><p>Depois</p>';
  const output=html.safeChapterHtml(input);assert.match(output,/<p>Antes<\/p><img[^>]+data-media-id="image-id"[^>]*\/><p>Depois<\/p>/);assert.ok(output.includes('/api/content-media?bucket=chapter-media'));assert.ok(!output.includes('onerror'));assert.equal(html.safeChapterHtml(output),output);
  for(const src of ['https://tracker.example/pixel.png','data:image/svg+xml,evil','javascript:alert(1)','/api/content-media?bucket=story-covers&path=other'])assert.ok(!html.safeChapterHtml(`<img src="${src}">`).includes('<img'));
 }finally{if(old===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=old;}
});

test('image uploads reject empty files, spoofed MIME types and executable formats',()=>{
 const source=readFileSync(new URL('../lib/security/uploads.ts',import.meta.url),'utf8');
 const exports={};const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('require','exports',js)(name=>{assert.equal(name,'@/lib/chat/safety');return safety;},exports);
 const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
 assert.equal(exports.imageMatchesType(png,'image/png'),true);
 assert.equal(exports.imageMatchesType(png,'image/jpeg'),false);
 for(const data of [Buffer.alloc(0),Buffer.from('<svg onload="alert(1)"></svg>'),Buffer.from('<html>not a PNG</html>')])assert.equal(exports.imageMatchesType(data,'image/png'),false);
});
