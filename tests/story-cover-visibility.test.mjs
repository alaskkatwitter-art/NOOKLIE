import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

function route({ visible = true, owner = false, linked = true, missing = false } = {}) {
  const tables = [];
  let downloads = 0;
  const db = {
    from(table) {
      tables.push(table);
      const query = {
        select() { return query; },
        in() { return query; },
        limit() {
          return Promise.resolve({ data: linked ? [{ id: 'story', author_id: 'author' }] : [], error: null });
        },
      };
      return query;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'story-covers');
        return { async download(path) {
          assert.equal(path, 'author/cover.jpg');
          downloads++;
          return { data: missing ? null : new Blob(['cover'], { type: 'image/jpeg' }), error: null };
        } };
      },
    },
  };
  const exports = {};
  const js = ts.transpileModule(readFileSync(new URL('../app/api/content-media/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', js)((name) => {
    if (name === '@/lib/discovery/server') return {
      discoveryDb: db, privateHeaders: { 'Cache-Control': 'no-store, private', Vary: 'Cookie' }, uuid: /^[a-f0-9-]{36}$/,
    };
    if (name === '@/lib/moderation/content-visibility') return {
      currentViewerProfileId: async () => owner ? 'author' : null,
      isPublicStoryVisible: async () => visible,
    };
    throw new Error('Unexpected import: ' + name);
  }, exports);
  return { get: () => exports.GET(new Request('https://nooklie.vercel.app/api/content-media?bucket=story-covers&path=author%2Fcover.jpg')), tables, downloads: () => downloads };
}

test('a visible story cover loads without published chapters', async () => {
  const fixture = route();
  const response = await fixture.get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/jpeg');
  assert.equal(await response.text(), 'cover');
  assert.deepEqual(fixture.tables, ['stories']);
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
