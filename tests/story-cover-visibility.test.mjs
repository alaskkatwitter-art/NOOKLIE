import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import ts from 'typescript';

function route({ visible = true, owner = false, linked = true, missing = false, bytes = 'cover', type = 'image/jpeg' } = {}) {
  const tables = [];
  let downloads = 0;
  const db = {
    async rpc(name, args) {
      assert.equal(name, 'content_media_allowed');
      assert.equal(args.p_bucket, 'story-covers');
      tables.push(name);
      return {data: linked && (visible || owner), error: null};
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'story-covers');
        return { async download(path) {
          assert.equal(path, 'author/cover.jpg');
          downloads++;
          return { data: missing ? null : new Blob([bytes], { type }), error: null };
        } };
      },
    },
  };
  const exports = {};
  const js = ts.transpileModule(readFileSync(new URL('../app/api/content-media/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', js)((name) => {
    if (name === 'node:crypto') return { createHash };
    if (name === 'sharp') return sharp;
    if (name === '@/lib/discovery/server') return {
      discoveryDb: db, privateHeaders: { 'Cache-Control': 'no-store, private', Vary: 'Cookie' }, uuid: /^[a-f0-9-]{36}$/,
    };
    if (name === '@/lib/auth/session') return {
      getSessionTokenHash: async () => owner ? 'author-session-hash' : null,
    };
    throw new Error('Unexpected import: ' + name);
  }, exports);
  return {
    get: ({ variant = '', headers } = {}) => exports.GET(new Request(
      'https://nooklie.vercel.app/api/content-media?bucket=story-covers&path=author%2Fcover.jpg' +
      (variant ? '&variant=' + variant : ''), { headers },
    )),
    tables,
    downloads: () => downloads,
  };
}

test('a released story cover loads for readers', async () => {
  const fixture = route();
  const response = await fixture.get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(await response.text(), 'cover');
  assert.deepEqual(fixture.tables, ['content_media_allowed']);
});

test('hidden or inaccessible story covers remain unavailable to other readers', async () => {
  const fixture = route({ visible: false });
  assert.equal((await fixture.get()).status, 404);
  assert.equal(fixture.downloads(), 0);
});

test('an author can preview their own cover before publication', async () => {
  assert.equal((await route({ owner: true, visible: false }).get()).status, 200);
});

test('unlinked and missing cover files remain unavailable', async () => {
  const fixture = route({ linked: false });
  assert.equal((await fixture.get()).status, 404);
  assert.equal(fixture.downloads(), 0);
  assert.equal((await route({ missing: true }).get()).status, 404);
});


test('a cover thumbnail is smaller and the original still loads at its full size', async () => {
  const original = await sharp({ create: {
    width: 1200, height: 1800, channels: 3, background: '#883366',
  } }).jpeg().toBuffer();
  const fixture = route({ bytes: original });
  const response = await fixture.get({ variant: 'cover' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.ok(bytes.length < original.length);
  assert.equal((await sharp(bytes).metadata()).width, 480);
  const full = await fixture.get();
  assert.notEqual(full.headers.get('etag'), response.headers.get('etag'));
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), original);
});

test('revalidation can reuse an image only after checking the current viewer', async () => {
  const fixture = route();
  const response = await fixture.get();
  const etag = response.headers.get('etag');
  assert.ok(etag);
  assert.equal(response.headers.get('cache-control'), 'private, no-cache');
  assert.equal(response.headers.get('vary'), 'Cookie');
  const request = { headers: { 'If-None-Match': etag } };
  const fresh = await fixture.get(request);
  assert.equal(fresh.status, 304);
  assert.equal((await fresh.arrayBuffer()).byteLength, 0);
  assert.equal(fixture.tables.length, 2);
  const denied = route({ visible: false });
  assert.equal((await denied.get(request)).status, 404);
  assert.equal(denied.downloads(), 0);
  const changed = route({ bytes: 'changed cover' });
  assert.equal((await changed.get(request)).status, 200);
});

test('a partial response retains the byte range and is not cached', async () => {
  const response = await route().get({ headers: { Range: 'bytes=0-1' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 0-1/5');
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.equal(await response.text(), 'co');
});
