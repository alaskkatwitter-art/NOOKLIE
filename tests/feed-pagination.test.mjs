import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const code = ts.transpileModule(
  readFileSync(new URL('../app/api/feed/route.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;
const id = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const created_at = '2026-11-07T12:00:00Z';

function fixture(viewer = 'reader') {
  const originals = Array.from({ length: 25 }, (_, i) => ({
    id: id(i), user_id: i === 24 ? 'muted' : 'writer', created_at,
  }));
  const reposts = [
    { id: id(25), post_id: id(0), user_id: 'writer', created_at },
    { id: id(26), post_id: id(24), user_id: 'writer', created_at },
  ];
  let enrichments = [];
  const query = {
    select() { return this; },
    is() { return this; },
    order() { return this; },
    then(resolve) { resolve({ data: originals }); },
  };
  const exports = {};
  const modules = {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/chat/server': { chatDb: { from: () => query } },
    '@/lib/social/feed-links': { normalizeHashtag: (tag) => tag },
    '@/lib/moderation/feed-controls': { hiddenFeedProfiles: async () => new Set(['muted']) },
    '@/lib/moderation/content-visibility': {
      currentViewerProfileId: async () => viewer,
      getPublicProfileIds: async () => new Set(['writer', 'muted']),
    },
    '@/lib/social/posts': {
      visibleReposts: async () => reposts,
      visiblePosts: async (ids, account) => {
        assert.equal(account, viewer);
        enrichments.push(ids);
        return originals.filter(post => ids.includes(post.id));
      },
    },
  };
  new Function('require', 'exports', code)(name => modules[name], exports);
  return {
    get: (query = '') => exports.GET(new Request('https://nooklie.vercel.app/api/feed' + query)),
    enrichments: () => enrichments,
  };
}

test('feed enriches one page at a time and paginates tied timestamps without gaps or repeats', async () => {
  const { get, enrichments } = fixture();
  const response = await get();
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  const first = await response.json();
  assert.equal(first.posts.length, 20);
  assert.equal(first.posts[0].repost.id, id(25));
  assert.ok(first.next_cursor);

  const second = await (await get('?before=' + encodeURIComponent(first.next_cursor))).json();
  assert.equal(second.next_cursor, null);
  assert.deepEqual([...first.posts, ...second.posts].map(post => post.repost?.id || post.id),
    [id(25), ...Array.from({ length: 24 }, (_, index) => id(23 - index))]);
  assert.deepEqual(enrichments().map(ids => ids.length), [20, 5]);
});

test('feed rejects malformed cursors and requires a signed-in reader', async () => {
  assert.equal((await fixture().get('?before=invalid')).status, 400);
  assert.equal((await fixture(null).get()).status, 401);
});
