import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url),
  id = (n) => '70000000-0000-0000-0000-' + String(n).padStart(12, '0');
function load(path, modules) {
  const exports = {};
  const code = ts.transpileModule(
    readFileSync(new URL('../' + path, import.meta.url), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    },
  ).outputText;
  new Function('require', 'exports', code)(
    (name) => modules[name] || require(name),
    exports,
  );
  return exports;
}
function fixture({
  actor = true,
  thread = {
    kind: 'group',
    status: 'accepted',
    initiator_id: id(1),
    avatar_path: null,
  },
  rows = {},
  race = false,
  rate = true,
} = {}) {
  const writes = [],
    storage = [],
    filters = [];
  const db = {
    from(table) {
      let action, body;
      const matches = [];
      const q = {
        select() {
          return q;
        },
        eq(key, val) {
          matches.push((row) => row[key] === val);
          return q;
        },
        is(key) {
          matches.push((row) => row[key] == null);
          return q;
        },
        in(key, values) {
          matches.push((row) => values.includes(row[key]));
          return q;
        },
        ilike(key, pattern) {
          filters.push(pattern);
          const escaped = pattern.replaceAll('\\_', '!UNDERSCORE!');
          const regex = new RegExp(
            '^' +
              escaped.replaceAll('%', '.*').replaceAll('!UNDERSCORE!', '_') +
              '$',
            'i',
          );
          matches.push((row) => regex.test(row[key]));
          return q;
        },
        or() {
          return q;
        },
        order() {
          return q;
        },
        limit() {
          return q;
        },
        insert(value) {
          action = 'insert';
          body = value;
          return q;
        },
        update(value) {
          action = 'update';
          body = value;
          return q;
        },
        async maybeSingle() {
          if (action) {
            writes.push({ table, action, body });
            return { data: race ? null : { id: id(10), ...body }, error: null };
          }
          return {
            data:
              (rows[table] || []).filter((row) =>
                matches.every((f) => f(row)),
              )[0] || null,
            error: null,
          };
        },
        async single() {
          writes.push({ table, action, body });
          return { data: { id: id(10), ...body }, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({
            data: (rows[table] || []).filter((row) =>
              matches.every((f) => f(row)),
            ),
            error: null,
          }).then(resolve, reject);
        },
      };
      return q;
    },
    async rpc() {
      return { data: rate, error: null };
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'group-avatars');
        return {
          async upload(path, bytes, options) {
            storage.push({ action: 'upload', path, type: options.contentType });
            return { error: null };
          },
          async remove(paths) {
            storage.push({ action: 'remove', paths });
            return { error: null };
          },
          async download(path) {
            storage.push({ action: 'download', path });
            return {
              data: new Blob(['photo'], { type: 'image/webp' }),
              error: null,
            };
          },
        };
      },
    },
  };
  const server = {
    chatActor: async () =>
      actor ? { profileId: id(1), sessionTokenHash: 'secret' } : null,
    chatDb: db,
    allowedThread: async () => thread,
    privateHeaders: { 'Cache-Control': 'no-store, private', Vary: 'Cookie' },
    uuid: /^[a-f0-9-]{36}$/i,
    sameOrigin: (req) =>
      !req.headers.get('origin') ||
      req.headers.get('origin') === new URL(req.url).origin,
  };
  const modules = {
    '@/lib/chat/server': server,
    '@/lib/security/rate-key': { rateLimitKey: () => 'hash' },
    '@/lib/security/uploads': {
      imageMatchesType: (bytes, type) =>
        type === 'image/png' && bytes[0] === 137,
    },
    '@/lib/moderation/content-visibility': {
      currentViewerProfileId: async () => (actor ? id(1) : null),
    },
    '@supabase/supabase-js': { createClient: () => db },
    '@/lib/news/articles': {
      isNewsArticle: (value) =>
        ['boas-vindas', 'originais', 'atualizacao-6-novembro-2026'].includes(
          value,
        ),
    },
  };
  const request = (method, body, origin) =>
    new Request('https://nooklie.vercel.app/api/test', {
      method,
      headers: origin ? { Origin: origin } : {},
      body: body instanceof FormData ? body : JSON.stringify(body),
    });
  return {
    writes,
    storage,
    filters,
    modules,
    request,
    context: { params: Promise.resolve({ id: id(10) }) },
  };
}
function image(type = 'image/png', bytes = [137, 80, 78, 71, 13, 10, 26, 10]) {
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type }), 'photo.png');
  return form;
}
test('group photos require accepted membership for reading and current ownership for changing', async () => {
  for (const options of [
    { actor: false },
    { thread: null },
    { thread: { kind: 'direct', status: 'accepted' } },
    { thread: { kind: 'group', status: 'pending' } },
    { thread: { kind: 'group', status: 'accepted', blocked: true } },
    { thread: { kind: 'group', status: 'accepted', initiator_id: id(2) } },
  ]) {
    const f = fixture(options),
      route = load('app/api/chat/groups/[id]/avatar/route.ts', f.modules);
    const response = await route.POST(f.request('POST', image()), f.context);
    assert.ok([401, 403].includes(response.status));
    assert.equal(f.storage.length, 0);
    assert.equal(f.writes.length, 0);
  }
  const allowed = fixture({
      thread: {
        kind: 'group',
        status: 'accepted',
        initiator_id: id(1),
        avatar_path: id(10) + '/photo.webp',
      },
    }),
    route = load('app/api/chat/groups/[id]/avatar/route.ts', allowed.modules);
  const response = await route.GET(
    new Request('https://nooklie.vercel.app'),
    allowed.context,
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store, private/);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const stranger = fixture({ thread: null });
  assert.equal(
    (
      await load(
        'app/api/chat/groups/[id]/avatar/route.ts',
        stranger.modules,
      ).GET(new Request('https://nooklie.vercel.app'), stranger.context)
    ).status,
    404,
  );
  assert.equal(stranger.storage.length, 0);
});
test('group photo writes validate image content, reject foreign origins and clean up ownership races', async () => {
  for (const [form, origin, status] of [
    [image('image/png', [60, 115, 118, 103]), null, 400],
    [image('image/svg+xml'), null, 400],
    [image(), 'https://foreign.example', 403],
  ]) {
    const f = fixture(),
      route = load('app/api/chat/groups/[id]/avatar/route.ts', f.modules);
    assert.equal(
      (await route.POST(f.request('POST', form, origin), f.context)).status,
      status,
    );
    assert.equal(f.storage.length, 0);
  }
  const f = fixture(),
    route = load('app/api/chat/groups/[id]/avatar/route.ts', f.modules);
  assert.equal(
    (await route.POST(f.request('POST', image()), f.context)).status,
    200,
  );
  assert.match(f.writes[0].body.avatar_path, new RegExp('^' + id(10) + '/'));
  assert.equal(f.storage[0].action, 'upload');
  const racing = fixture({ race: true }),
    other = load('app/api/chat/groups/[id]/avatar/route.ts', racing.modules);
  assert.equal(
    (await other.POST(racing.request('POST', image()), racing.context)).status,
    409,
  );
  assert.equal(racing.storage[1].action, 'remove');
  assert.deepEqual(racing.storage[1].paths, [racing.storage[0].path]);
  const old = id(10) + '/old.webp',
    remove = fixture({
      thread: {
        kind: 'group',
        status: 'accepted',
        initiator_id: id(1),
        avatar_path: old,
      },
    });
  assert.equal(
    (
      await load(
        'app/api/chat/groups/[id]/avatar/route.ts',
        remove.modules,
      ).DELETE(remove.request('DELETE'), remove.context)
    ).status,
    200,
  );
  assert.equal(remove.writes[0].body.avatar_path, null);
  assert.deepEqual(remove.storage[0].paths, [old]);
});
test('partial @username search filters suspended, blocked and already invited people without exposing account IDs', async () => {
  const people = [1, 2, 3, 4, 5].map((n) => ({
    id: id(n),
    user_id: 'account-' + n,
    username: 'ana' + n,
    display_name: 'Ana ' + n,
    avatar_url: null,
  }));
  const f = fixture({
      rows: {
        profiles: people,
        auth_accounts: people.map((p, i) => ({
          id: p.user_id,
          account_status: i === 2 ? 'suspended' : 'active',
        })),
        chat_blocks: [{ blocker_id: id(1), blocked_id: id(4) }],
        chat_group_members: [{ thread_id: id(10), profile_id: id(5) }],
      },
    }),
    route = load('app/api/chat/people/route.ts', f.modules);
  const response = await route.GET(
    new Request(
      'https://nooklie.vercel.app/api/chat/people?q=@an&thread=' + id(10),
    ),
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(
    data.people.map((p) => p.username),
    ['ana2'],
  );
  assert.equal(data.people[0].user_id, undefined);
  assert.deepEqual(f.filters, ['an%', '%an%']);
  const anonymous = fixture({ actor: false });
  assert.equal(
    (
      await load('app/api/chat/people/route.ts', anonymous.modules).GET(
        new Request('https://nooklie.vercel.app/api/chat/people?q=an'),
      )
    ).status,
    401,
  );
  const stranger = fixture({ thread: null });
  assert.equal(
    (
      await load('app/api/chat/people/route.ts', stranger.modules).GET(
        new Request(
          'https://nooklie.vercel.app/api/chat/people?q=an&thread=' + id(10),
        ),
      )
    ).status,
    403,
  );
  const wildcard = fixture();
  await load('app/api/chat/people/route.ts', wildcard.modules).GET(
    new Request('https://nooklie.vercel.app/api/chat/people?q=ana_'),
  );
  assert.deepEqual(wildcard.filters, ['ana\\_%', '%ana\\_%']);
});
test('news-only posts retain their article on edit and invalid article links cannot be published', async () => {
  const f = fixture({
      rows: { profiles: [{ id: id(1), username: 'author' }] },
    }),
    route = load('app/api/nook-posts/route.ts', f.modules);
  assert.equal(
    (await route.POST(f.request('POST', { news_slug: 'boas-vindas' }))).status,
    201,
  );
  assert.equal(f.writes[0].body.news_slug, 'boas-vindas');
  assert.equal(f.writes[0].body.user_id, id(1));
  for (const body of [
    { news_slug: 'fake' },
    { news_slug: 'originais', story_id: id(20) },
    {},
  ])
    assert.equal((await route.POST(f.request('POST', body))).status, 400);
  assert.equal(
    (
      await route.POST(
        f.request(
          'POST',
          { news_slug: 'originais' },
          'https://foreign.example',
        ),
      )
    ).status,
    403,
  );
  const edit = fixture({
      rows: {
        nook_posts: [
          {
            id: id(10),
            user_id: id(1),
            body: '',
            image_url: null,
            story_id: null,
            news_slug: 'originais',
          },
        ],
      },
    }),
    patch = load('app/api/nook-posts/[id]/route.ts', edit.modules);
  assert.equal(
    (
      await patch.PATCH(
        edit.request('PATCH', { body: '', story_id: null }),
        edit.context,
      )
    ).status,
    200,
  );
  assert.equal(edit.writes[0].body.news_slug, undefined);
  assert.equal(
    (
      await patch.PATCH(
        edit.request('PATCH', { news_slug: null }),
        edit.context,
      )
    ).status,
    400,
  );
});
test('database constrains article links and group photos while keeping the bucket private', async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text);alter table storage.objects enable row level security;create table nook_posts(id uuid,story_id uuid);create table chat_threads(id uuid,kind text);`,
    );
    await db.exec(
      readFileSync(
        new URL(
          '../supabase/migrations/20261107024713_news_sharing_and_group_avatars.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await db.exec(
      `insert into nook_posts(id,news_slug)values('${id(1)}','originais');insert into chat_threads(id,kind,avatar_path)values('${id(10)}','group','${id(10)}/${id(11)}.webp');`,
    );
    for (const sql of [
      `insert into nook_posts(news_slug)values('fake')`,
      `insert into nook_posts(news_slug,story_id)values('originais','${id(9)}')`,
      `insert into chat_threads(id,kind,avatar_path)values('${id(10)}','direct','${id(10)}/${id(11)}.png')`,
      `update chat_threads set avatar_path='${id(12)}/${id(11)}.png'`,
    ])
      await assert.rejects(db.exec(sql));
    assert.equal(
      (
        await db.query(
          "select public from storage.buckets where id='group-avatars'",
        )
      ).rows[0].public,
      false,
    );
    assert.equal(
      (
        await db.query(
          "select permissive from pg_policies where policyname='group_avatars_server_only'",
        )
      ).rows[0].permissive,
      'RESTRICTIVE',
    );
  } finally {
    await db.close();
  }
});
