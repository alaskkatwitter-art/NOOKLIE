import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import ts from 'typescript';

function route({ visible = true, owner = false, linked = true, missing = false,
  bytes = 'cover', type = 'image/jpeg', supportsRange = false } = {}) {
  const tables = [];
  let downloads = 0;
  const requests = [];
  const db = {
    async rpc(name, args) {
      assert.equal(name, 'content_media_allowed');
      assert.equal(args.p_bucket, 'story-covers');
      tables.push(name);
      return { data: linked && (visible || owner), error: null };
    },
  };
  const source = Buffer.from(bytes);
  const sourceTag = () => '"' + createHash('md5').update(source).digest('hex') + '"';
  async function mockFetch(url, options) {
    assert.ok(url.endsWith('/storage/v1/object/story-covers/author/cover.jpg'));
    const requested = options.headers.get('if-none-match');
    const range = options.headers.get('range');
    requests.push({ requested, range });
    if (missing) return new Response(null, { status: 404 });
    const etag = sourceTag();
    if (requested?.split(', ').includes(etag)) return new Response(null, { status: 304, headers: { etag } });
    downloads++;
    const headers = { 'Content-Type': type, etag };
    if (supportsRange && range) {
      assert.equal(range, 'bytes=0-1');
      return new Response(source.subarray(0, 2), { status: 206, headers: {
        ...headers, 'Content-Range': `bytes 0-1/${source.length}`, 'Content-Length': '2',
      } });
    }
    return new Response(source, { headers: { ...headers, 'Content-Length': String(source.length) } });
  }
  const exports = {};
  const js = ts.transpileModule(readFileSync(new URL('../app/api/content-media/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', 'fetch', js)((name) => {
    if (name === 'sharp') return sharp;
    if (name === '@/lib/discovery/server') return {
      discoveryDb: db, privateHeaders: { 'Cache-Control': 'no-store, private', Vary: 'Cookie' },
    };
    if (name === '@/lib/auth/session') return {
      getSessionTokenHash: async () => owner ? 'author-session-hash' : null,
    };
    throw new Error('Unexpected import: ' + name);
  }, exports, mockFetch);
  return {
    get: ({ variant = '', headers } = {}) => exports.GET(new Request(
      'https://nooklie.vercel.app/api/content-media?bucket=story-covers&path=author%2Fcover.jpg' +
      (variant ? '&variant=' + variant : ''), { headers },
    )),
    tables,
    downloads: () => downloads,
    requests,
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
  assert.equal(fixture.downloads(), 1);
  assert.ok(fixture.requests[1].requested);
  const denied = route({ visible: false });
  assert.equal((await denied.get(request)).status, 404);
  assert.equal(denied.requests.length, 0);
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


test('a warm thumbnail can serve another authorized browser without downloading the original again', async () => {
  const original = await sharp({ create: {
    width: 900, height: 1300, channels: 3, background: '#287085',
  } }).jpeg().toBuffer();
  const fixture = route({ bytes: original });
  const first = await fixture.get({ variant: 'cover' });
  const second = await fixture.get({ variant: 'cover' });
  assert.equal(second.status, 200);
  assert.equal(second.headers.get('content-type'), 'image/webp');
  assert.deepEqual(await first.arrayBuffer(), await second.arrayBuffer());
  assert.equal(fixture.downloads(), 1);
  assert.equal(fixture.tables.length, 2);
});

test('an original partial request forwards its byte range to Storage', async () => {
  const fixture = route({ supportsRange: true });
  const response = await fixture.get({ headers: { Range: 'bytes=0-1' } });
  assert.equal(fixture.requests[0].range, 'bytes=0-1');
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 0-1/5');
  assert.equal(await response.text(), 'co');
});
