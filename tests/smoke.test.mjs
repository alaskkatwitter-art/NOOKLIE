import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { after, before, test } from 'node:test';

let appServer;
let supabaseMock;
let baseUrl;
const userId = 'user-owner';
const otherUserId = 'user-other';
const storyId = 'story-owned';
const recoveryKey = 'known-recovery-key';
const categoryIds = {
  genre: 'category-genre',
  freeform: 'category-freeform',
  fandom: 'category-fandom',
  characters: 'category-characters',
  relationships: 'category-relationships',
  'content-warning': 'category-warning',
  tropes: 'category-tropes',
};
const categories = Object.entries(categoryIds).map(([slug, id]) => ({
  id,
  slug,
  name: slug === 'genre' ? 'Gênero' : slug === 'freeform' ? 'Tags livres' : slug,
}));
const state = { notifications: [], discoveryPreferences: new Map(), readerPreferences: new Map(), readerUnavailable: false, account: null, sessions: [], chapters: [], rateLimits: new Map(), categories, tags: [], discoveryStories: [], storyTags: [] };
const profileAppearance = { header_layout: 'classic', avatar_position: 'left' };
let libraryFixture = null;

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function getAvailablePort() {
  const probe = createNetServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

function sendJson(response, body, status = 200, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  response.end(JSON.stringify(body));
}

function respondRows(request, response, rows, status = 200) {
  if ((request.headers.accept || '').includes('application/vnd.pgrst.object+json')) {
    if (!rows.length) return sendJson(response, { code: 'PGRST116', details: '0 rows' }, 406);
    return sendJson(response, rows[0], status);
  }
  return sendJson(response, rows, status);
}

before(async () => {
  state.account = {
    id: userId,
    username: 'owner',
    password_hash: await bcrypt.hash('correct-password', 4),
    recovery_key_hash: await bcrypt.hash(recoveryKey, 4),
    account_status: 'active',
  };
  state.tags = [
    { id: 'tag-fantasia', name: 'Fantasia', slug: 'fantasia', category_id: categoryIds.genre, created_at: new Date().toISOString() },
    { id: 'tag-romance', name: 'Romance', slug: 'romance', category_id: categoryIds.genre, created_at: new Date().toISOString() },
    { id: 'tag-terror', name: 'Terror', slug: 'terror', category_id: categoryIds['content-warning'], created_at: new Date().toISOString() },
  ];
  state.discoveryStories = [
    { id: 'story-filter-one', story_kind: 'original', story_format: 'conto', author_id: userId, title: 'Dragões e Romance', description: 'Uma aventura', cover_url: null, status: 'Concluída', rating: '12', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-02T00:00:00.000Z' },
    { id: 'story-filter-two', story_kind: 'fanfic', author_id: userId, title: 'Fantasia sombria', description: 'Um mistério', cover_url: null, status: 'Em andamento', rating: '18', created_at: '2026-10-03T00:00:00.000Z', updated_at: '2026-10-04T00:00:00.000Z' },
    { id: 'story-filter-draft', author_id: userId, title: 'Rascunho de fantasia', description: 'Ainda não publicada', cover_url: null, status: 'Concluída', rating: '12', created_at: '2026-10-05T00:00:00.000Z', updated_at: '2026-10-06T00:00:00.000Z' },
  ];
  state.storyTags = [
    { story_id: 'story-filter-one', tag_id: 'tag-fantasia' },
    { story_id: 'story-filter-one', tag_id: 'tag-romance' },
    { story_id: 'story-filter-two', tag_id: 'tag-fantasia' },
    { story_id: 'story-filter-two', tag_id: 'tag-terror' },
  ];
  state.chapters.push(
    { id: 'published-one', story_id: 'story-filter-one', chapter_number: 1, published: true },
    { id: 'published-two', story_id: 'story-filter-two', chapter_number: 1, published: true },
  );
  for (let index = 1; index <= 25; index += 1) {
    const id = `story-page-${index}`;
    state.discoveryStories.push({
      id,
      author_id: userId,
      title: `Livro ${index}`,
      description: 'História de paginação',
      cover_url: null,
      status: 'Em andamento',
      rating: 'Livre',
      created_at: `2026-10-${String(index).padStart(2, '0')}T00:00:00.000Z`,
      updated_at: `2026-10-${String(index).padStart(2, '0')}T00:00:00.000Z`,
    });
    state.chapters.push({ id: `chapter-page-${index}`, story_id: id, chapter_number: 1, published: true });
  }

  supabaseMock = createHttpServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const path = url.pathname.replace('/rest/v1/', '');

    if (libraryFixture && request.method === 'GET') {
      const owner = url.searchParams.get('user_id') === `eq.${userId}`;
      if (path === 'reading_lists') return respondRows(request, response, owner ? [{ id: 'library', name: 'Biblioteca' }] : []);
      if (path === 'reading_list_items') return respondRows(request, response, libraryFixture.stories.map(story => ({ list_id: 'library', story_id: story.id })));
      if (path === 'released_stories') return respondRows(request, response, libraryFixture.stories);
      if (path === 'profiles') return respondRows(request, response, [{ id: userId, user_id: userId, username: 'owner' }]);
      if (path === 'auth_accounts') return respondRows(request, response, [{ id: userId, account_status: 'active' }]);
      if (path === 'chat_blocks') return respondRows(request, response, []);
      if (path === 'reading_progress') return respondRows(request, response, owner ? libraryFixture.progress : []);
      if (path === 'stories' && url.searchParams.get('select')?.includes('chapter_favorites')) {
        return respondRows(request, response, url.searchParams.get('chapters.chapter_favorites.user_id') === `eq.${userId}` ? [{ id: 'earlier' }] : []);
      }
      if (path === 'stories') return respondRows(request, response, [
        { id: 'finished', chapters: [{ id: 'last-chapter' }] },
        { id: 'earlier', chapters: [{ id: 'a-later-chapter' }] },
      ]);
    }

    if (path === 'user_notifications') {
      const owner=(url.searchParams.get('user_id')||'').replace(/^eq\./,'');
      let rows=state.notifications.filter(row=>row.user_id===owner);
      if(request.method==='GET')return respondRows(request,response,rows);
      if(request.method==='PATCH'){
        let body='';for await(const chunk of request)body+=chunk;const update=JSON.parse(body);
        const id=(url.searchParams.get('id')||'').replace(/^eq\./,'');
        rows=rows.filter(row=>!row.read_at&&(!id||row.id===id));rows.forEach(row=>row.read_at=update.read_at);
        response.writeHead(204);return response.end();
      }
    }
    if (path === 'rpc/discovery_fandom_catalog') return sendJson(response, ['Harry Potter','Marvel']);
    if (path === 'discovery_preferences') {
      if (request.method === 'GET') { const id=(url.searchParams.get('user_id')||'').replace(/^eq\./,''); return respondRows(request,response,state.discoveryPreferences.has(id)?[{favorite_fandoms:state.discoveryPreferences.get(id)}]:[]); }
      if (request.method === 'POST') { let body='';for await(const chunk of request)body+=chunk;const row=JSON.parse(body);state.discoveryPreferences.set(row.user_id,row.favorite_fandoms);response.writeHead(201);return response.end(); }
    }
    if (path === 'reader_preferences') {
      if (state.readerUnavailable) return sendJson(response, { code: '42P01', message: 'Unavailable fixture' }, 503);
      if (request.method === 'GET') {
        const id = (url.searchParams.get('user_id') || '').replace(/^eq\./, '');
        return respondRows(request, response, state.readerPreferences.has(id) ? [{ preferences: state.readerPreferences.get(id) }] : []);
      }
      if (request.method === 'POST') {
        let body = ''; for await (const chunk of request) body += chunk;
        const row = JSON.parse(body);
        state.readerPreferences.set(row.user_id, row.preferences);
        response.writeHead(201); return response.end();
      }
    }

    if (path === 'rpc/consume_auth_rate_limit' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const { p_key_hash, p_limit } = JSON.parse(body);
      const count = (state.rateLimits.get(p_key_hash) || 0) + 1;
      state.rateLimits.set(p_key_hash, count);
      return sendJson(response, count <= p_limit);
    }

    if ((path === 'rpc/search_public_stories' || path === 'rpc/search_visible_stories' || path === 'rpc/search_catalog_stories') && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      const tagSlugs = new Map(state.tags.map((tag) => [tag.id, tag.slug]));
      const storySlugs = new Map();
      for (const relation of state.storyTags) {
        const slugs = storySlugs.get(relation.story_id) || [];
        slugs.push(tagSlugs.get(relation.tag_id));
        storySlugs.set(relation.story_id, slugs);
      }
      let rows = state.discoveryStories.filter((story) => {
        const slugs = storySlugs.get(story.id) || [];
        const query = (input.p_query || '').toLowerCase();
        return (!query || `${story.title} ${story.description || ''}`.toLowerCase().includes(query)) &&
          (input.p_include_slugs || []).every((slug) => slugs.includes(slug)) &&
          !(input.p_exclude_slugs || []).some((slug) => slugs.includes(slug)) &&
          (!input.p_kind || story.story_kind === input.p_kind) &&
          (!input.p_format || story.story_format === input.p_format) &&
          (!input.p_rating || story.rating === input.p_rating) &&
          (!input.p_status || story.status === input.p_status) &&
          state.chapters.some((chapter) => chapter.story_id === story.id && chapter.published);
      });
      if (input.p_sort === 'newest') rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
      else if (input.p_sort === 'title_asc') rows.sort((a, b) => a.title.localeCompare(b.title));
      else if (input.p_sort === 'title_desc') rows.sort((a, b) => b.title.localeCompare(a.title));
      else rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
      return sendJson(response, rows.slice(input.p_offset || 0, (input.p_offset || 0) + (input.p_limit || 24)));
    }

    if (path === 'rpc/complete_auth_recovery' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      if (input.p_account_id !== state.account.id || input.p_expected_recovery_key_hash !== state.account.recovery_key_hash) {
        return sendJson(response, false);
      }
      state.account.password_hash = input.p_new_password_hash;
      state.account.recovery_key_hash = input.p_consumed_recovery_key_hash;
      state.sessions = [];
      return sendJson(response, true);
    }

    if (path === 'tag_categories' && request.method === 'GET') {
      let rows = state.categories;
      const slug = (url.searchParams.get('slug') || '').replace(/^eq\./, '');
      if (slug) rows = rows.filter((category) => category.slug === slug);
      return respondRows(request, response, rows);
    }

    if (path === 'news_comments' && request.method === 'GET') return sendJson(response, []);

    if (path === 'tags' && request.method === 'GET') {
      let rows = state.tags;
      const slug = (url.searchParams.get('slug') || '').replace(/^eq\./, '');
      const categoryId = (url.searchParams.get('category_id') || '').replace(/^eq\./, '');
      const name = (url.searchParams.get('name') || '').replace(/^ilike\./, '').replace(/%/g, '').toLowerCase();
      if (slug) rows = rows.filter((tag) => tag.slug === slug);
      if (categoryId) rows = rows.filter((tag) => tag.category_id === categoryId);
      if (name) rows = rows.filter((tag) => tag.name.toLowerCase().includes(name));
      const limit = Number(url.searchParams.get('limit') || 120);
      return respondRows(request, response, rows.slice(0, limit));
    }

    if (path === 'tags' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const tag = { id: `tag-${state.tags.length + 1}`, created_at: new Date().toISOString(), ...JSON.parse(body) };
      state.tags.push(tag);
      return respondRows(request, response, [tag], 201);
    }

    if (path === 'story_tags' && request.method === 'GET') {
      const rows = state.storyTags.map((relation) => {
        const tag = state.tags.find((item) => item.id === relation.tag_id);
        const category = state.categories.find((item) => item.id === tag?.category_id);
        return { ...relation, tags: tag ? { ...tag, tag_categories: category ? { name: category.name, slug: category.slug } : null } : null };
      });
      return respondRows(request, response, rows);
    }

    if (path === 'profiles' && request.method === 'GET') {
      const select = (url.searchParams.get('select') || '').split(',').map(field => field.trim());
      const profile = { id: userId, username: 'owner', display_name: 'Owner', avatar_url: null };
      if (select.includes('verified')) profile.verified = true;
      if (select.includes('is_official')) profile.is_official = true;
      if (select.includes('header_layout')) profile.header_layout = profileAppearance.header_layout;
      if (select.includes('avatar_position')) profile.avatar_position = profileAppearance.avatar_position;
      return sendJson(response, [profile]);
    }
    if (path === 'profiles' && request.method === 'PATCH') {
      if (url.searchParams.get('user_id') !== `eq.${userId}`) return respondRows(request, response, []);
      let body = '';
      for await (const chunk of request) body += chunk;
      const patch = JSON.parse(body);
      if (patch.header_layout) profileAppearance.header_layout = patch.header_layout;
      if (patch.avatar_position) profileAppearance.avatar_position = patch.avatar_position;
      return respondRows(request, response, [{ id: userId, ...profileAppearance }]);
    }

    if (path === 'auth_accounts' && request.method === 'GET') {
      const username = (url.searchParams.get('username') || '').replace(/^eq\./, '');
      const accountId = (url.searchParams.get('id') || '').replace(/^eq\./, '');
      const rows = username === state.account.username || accountId === state.account.id ? [state.account] : [];
      return respondRows(request, response, rows);
    }

    if (path === 'auth_sessions' && request.method === 'GET') {
      const tokenHash = (url.searchParams.get('token_hash') || '').replace(/^eq\./, '');
      const rows = state.sessions.filter((session) => session.token_hash === tokenHash);
      return respondRows(request, response, rows);
    }

    if (path === 'auth_sessions' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      state.sessions.push(JSON.parse(body));
      response.writeHead(201);
      return response.end();
    }

    if (path === 'auth_sessions' && request.method === 'DELETE') {
      const userFilter = (url.searchParams.get('user_id') || '').replace(/^eq\./, '');
      const tokenFilter = (url.searchParams.get('token_hash') || '').replace(/^eq\./, '');
      state.sessions = state.sessions.filter((session) =>
        (userFilter && session.user_id !== userFilter) ||
        (tokenFilter && session.token_hash !== tokenFilter)
      );
      response.writeHead(204);
      return response.end();
    }

    if (path === 'released_stories' && request.method === 'GET') {
      const ids = (url.searchParams.get('id') || '').slice(4, -1).split(',');
      return respondRows(request, response, state.discoveryStories.filter(story => ids.includes(story.id))
        .map(({ id, fandom }) => ({ id, fandom: fandom || '' })));
    }

    if (path === 'stories' && request.method === 'GET') {
      const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
      const rows = id === storyId ? [{ id: storyId, author_id: userId }] : [];
      return respondRows(request, response, rows);
    }

    if (path === 'chapters' && request.method === 'GET') {
      if ((url.searchParams.get('select') || '').includes('story_id')) {
        return sendJson(response, state.chapters.filter((chapter) => chapter.published).map((chapter) => ({ story_id: chapter.story_id })));
      }
      const rows = state.chapters
        .filter((chapter) => chapter.story_id === (url.searchParams.get('story_id') || '').replace(/^eq\./, ''))
        .sort((a, b) => b.chapter_number - a.chapter_number)
        .slice(0, Number(url.searchParams.get('limit') || 1))
        .map(({ chapter_number }) => ({ chapter_number }));
      return respondRows(request, response, rows);
    }

    if (path === 'chapters' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const chapter = { id: `chapter-${state.chapters.length + 1}`, ...JSON.parse(body) };
      state.chapters.push(chapter);
      return respondRows(request, response, [chapter], 201);
    }

    if (path === 'scheduled_chapters' && request.method === 'DELETE') {
      response.writeHead(204);
      return response.end();
    }

    sendJson(response, { message: `Unexpected mock request: ${request.method} ${url.pathname}` }, 404);
  });
  await new Promise((resolve) => supabaseMock.listen(0, '127.0.0.1', resolve));
  const mockPort = supabaseMock.address().port;
  const appPort = await getAvailablePort();
  baseUrl = `http://127.0.0.1:${appPort}`;

  appServer = spawn(
    process.execPath,
    [join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '--hostname', '127.0.0.1', '--port', String(appPort)],
    {
      stdio: 'ignore',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${mockPort}`,
        SUPABASE_URL: `http://127.0.0.1:${mockPort}`,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'ci-placeholder',
        SUPABASE_SECRET_KEY: 'ci-placeholder',
        NEXT_PUBLIC_SITE_URL: baseUrl,
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  );

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (appServer.exitCode !== null) throw new Error(`Next.js exited before ready (code ${appServer.exitCode}).`);
    try {
      if ((await fetch(baseUrl)).ok) return;
    } catch {
      // The production server is still starting.
    }
    await delay(500);
  }
  appServer.kill('SIGTERM');
  throw new Error('Next.js did not become ready within 60 seconds.');
});

after(async () => {
  if (appServer && appServer.exitCode === null) {
    appServer.kill('SIGTERM');
    await Promise.race([once(appServer, 'exit'), delay(5_000)]);
    if (appServer.exitCode === null) appServer.kill('SIGKILL');
  }
  if (supabaseMock?.listening) await new Promise((resolve) => supabaseMock.close(resolve));
});

test('the home page responds successfully and identifies NOOKLIE', async () => {
  const response = await fetch(baseUrl);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /NOOKLIE/);
});

test('library distinguishes reading the last published chapter from finishing an earlier chapter', async () => {
  const token = 'library-shelf-session';
  const ids = ['unread', 'earlier', 'finished'];
  state.sessions.push({ user_id: userId, token_hash: hash(token), expires_at: new Date(Date.now() + 60_000).toISOString() });
  libraryFixture = {
    stories: ids.map(id => ({ id, title: id, author_id: userId, status: 'Concluída' })),
    progress: [
      { story_id: 'earlier', chapter_id: 'first-chapter', progress_percent: 100, chapters: { title: 'Primeiro', story_id: 'earlier' } },
      { story_id: 'finished', chapter_id: 'last-chapter', progress_percent: 100, chapters: { title: 'Último', story_id: 'finished' } },
    ],
  };
  try {
    assert.equal((await fetch(baseUrl + '/api/library')).status, 401);
    const response = await fetch(baseUrl + '/api/library', { headers: { Cookie: `toriland_session=${token}` } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('cache-control'), /private/);
    const { items, reading_details_available } = await response.json();
    assert.equal(reading_details_available, true);
    assert.deepEqual(items.map(item => [item.story_id, item.chapter_id, item.reading_completed, item.has_favorite_chapter]), [
      ['unread', null, false, false],
      ['earlier', 'first-chapter', false, true],
      ['finished', 'last-chapter', true, false],
    ]);
  } finally {
    libraryFixture = null;
    state.sessions = state.sessions.filter(session => session.token_hash !== hash(token));
  }
});

test('profile appearance only saves supported choices on the authenticated profile', async () => {
  const token = 'profile-appearance-session';
  state.sessions.push({ user_id: userId, token_hash: hash(token), expires_at: new Date(Date.now() + 60_000).toISOString() });
  try {
    const save = (body, authenticated = true) => fetch(baseUrl + '/api/profile/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(authenticated ? { Cookie: `toriland_session=${token}` } : {}) },
      body: JSON.stringify(body),
    });
    assert.equal((await save({ header_layout: 'immersive' }, false)).status, 401);
    assert.equal((await save({ header_layout: 'unsupported', avatar_position: 'right' })).status, 400);
    assert.equal((await save({ avatar_position: null })).status, 400);
    assert.deepEqual(profileAppearance, { header_layout: 'classic', avatar_position: 'left' });

    const response = await save({ header_layout: 'immersive', avatar_position: 'right', user_id: otherUserId });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).user, { id: userId, header_layout: 'immersive', avatar_position: 'right' });
    const nameChange = await save({ display_name: 'Owner' });
    assert.equal(nameChange.status, 200);
    assert.deepEqual((await nameChange.json()).user, { id: userId, header_layout: 'immersive', avatar_position: 'right' });
  } finally {
    state.sessions = state.sessions.filter(session => session.token_hash !== hash(token));
    Object.assign(profileAppearance, { header_layout: 'classic', avatar_position: 'left' });
  }
});

test('login rejects invalid credentials and creates a hashed session on success', async () => {
  const invalid = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-vercel-forwarded-for': '198.51.100.11' },
    body: JSON.stringify({ username: 'owner', password: 'wrong-password' }),
  });
  assert.equal(invalid.status, 401);

  state.account.account_status = 'suspended';
  const suspended = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-vercel-forwarded-for': '198.51.100.13' },
    body: JSON.stringify({ username: 'owner', password: 'correct-password' }),
  });
  assert.equal(suspended.status, 403);
  assert.equal(state.sessions.length, 0);
  state.account.account_status = 'active';

  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-vercel-forwarded-for': '198.51.100.12' },
    body: JSON.stringify({ username: 'owner', password: 'correct-password' }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).user, { id: userId, username: 'owner' });
  assert.match(response.headers.get('set-cookie'), /HttpOnly/);
  const cookieToken = response.headers.get('set-cookie').match(/toriland_session=([^;]+)/)[1];
  assert.ok(state.sessions.some((session) => session.token_hash === hash(cookieToken)));
  assert.ok(state.sessions.every((session) => session.token_hash !== cookieToken));
});

test('login rate-limits repeated attempts', async () => {
  let response;
  for (let attempt = 0; attempt < 11; attempt += 1) {
    response = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-vercel-forwarded-for': '198.51.100.20' },
      body: JSON.stringify({ username: 'missing_user', password: 'wrong-password' }),
    });
  }
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '900');
});

test('recovery rejects a wrong key and atomically rotates credentials and sessions', async () => {
  let invalid;
  for (let attempt = 0; attempt < 11; attempt += 1) {
    invalid = await fetch(`${baseUrl}/api/auth/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-vercel-forwarded-for': '198.51.100.30' },
      body: JSON.stringify({ username: 'owner', recoveryKey: 'wrong-key', newPassword: 'new-password' }),
    });
  }
  assert.equal(invalid.status, 429);
  assert.equal(invalid.headers.get('retry-after'), '900');

  const response = await fetch(`${baseUrl}/api/auth/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-vercel-forwarded-for': '198.51.100.31' },
    body: JSON.stringify({ username: 'owner', recoveryKey, newPassword: 'new-password' }),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.match(result.recoveryKey, /^[a-f0-9]{32}$/);
  assert.equal(state.sessions.length, 0);
  assert.equal(await bcrypt.compare('new-password', state.account.password_hash), true);
  assert.equal(await bcrypt.compare(result.recoveryKey, state.account.recovery_key_hash), true);
});

test('chapter creation requires authentication and confirms story ownership', async () => {
  const endpoint = `${baseUrl}/api/chapters/create`;
  const payload = { story_id: storyId, title: 'Novo capítulo', body: 'Texto do capítulo' };
  const unauthenticated = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(unauthenticated.status, 401);

  const otherToken = 'other-session-token';
  state.sessions.push({ user_id: otherUserId, token_hash: hash(otherToken), expires_at: new Date(Date.now() + 60_000).toISOString() });
  const forbidden = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `toriland_session=${otherToken}` },
    body: JSON.stringify(payload),
  });
  assert.equal(forbidden.status, 403);

  const ownerToken = 'owner-session-token';
  state.sessions.push({ user_id: userId, token_hash: hash(ownerToken), expires_at: new Date(Date.now() + 60_000).toISOString() });
  state.chapters.push({ id: 'chapter-existing', story_id: storyId, chapter_number: 2 });
  const created = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `toriland_session=${ownerToken}` },
    body: JSON.stringify(payload),
  });
  assert.equal(created.status, 201);
  const result = await created.json();
  assert.equal(result.chapter.chapter_number, 3);
  assert.equal(result.chapter.title, 'Novo capítulo');
});


test('discovery applies included and excluded tags, rating, status, and sort', async () => {
  const response = await fetch(
    `${baseUrl}/api/explore?includeTag=fantasia&includeTag=romance&excludeTag=terror&rating=12&status=${encodeURIComponent('Concluída')}&sort=newest`,
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.stories.map((story) => story.id), ['story-filter-one']);
  assert.deepEqual(result.stories[0].tags.map((tag) => tag.slug).sort(), ['fantasia', 'romance']);
});

test('signed-in readers can publish a categorized tag immediately and duplicates are reused', async () => {
  const endpoint = `${baseUrl}/api/tags`;
  const body = { name: 'Coffee Shop AU', category: 'tropes' };
  const anonymous = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal(anonymous.status, 401);

  const token = 'tag-creator-session';
  state.sessions.push({ user_id: userId, token_hash: hash(token), expires_at: new Date(Date.now() + 60_000).toISOString() });
  const headers = { 'Content-Type': 'application/json', Cookie: `toriland_session=${token}` };
  const createdResponse = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal(createdResponse.status, 201);
  const created = await createdResponse.json();
  assert.equal(created.created, true);
  assert.equal(created.tag.slug, 'coffee-shop-au');

  const catalogResponse = await fetch(`${endpoint}?q=Coffee`);
  assert.equal(catalogResponse.status, 200);
  const catalog = await catalogResponse.json();
  assert.ok(catalog.tags.some((tag) => tag.slug === 'coffee-shop-au' && tag.category.slug === 'tropes'));

  const duplicate = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name: 'coffee shop au', category: 'freeform' }),
  });
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).created, false);
});


test('originals can be discovered by type and literary format', async () => {
  const response = await fetch(`${baseUrl}/api/explore?kind=original&format=conto&sort=debut`);
  assert.equal(response.status, 200);
  const { stories } = await response.json();
  assert.deepEqual(stories.map(story => [story.title, story.story_kind, story.story_format]), [
    ['Dragões e Romance', 'original', 'conto'],
  ]);
  assert.equal(stories[0].author.verified, true);
  assert.equal(stories[0].author.is_official, true);
  assert.equal((await fetch(`${baseUrl}/api/explore?kind=invalido`)).status, 400);
});

test('story discovery can continue to the next page', async () => {
  const firstResponse = await fetch(`${baseUrl}/api/explore`);
  assert.equal(firstResponse.status, 200);
  const firstPage = await firstResponse.json();
  assert.equal(firstPage.stories.length, 24);
  assert.equal(firstPage.has_more, true);

  const secondResponse = await fetch(`${baseUrl}/api/explore?page=2`);
  assert.equal(secondResponse.status, 200);
  const secondPage = await secondResponse.json();
  assert.equal(secondPage.stories.length, 3);
  assert.equal(secondPage.has_more, false);
  assert.equal(new Set([...firstPage.stories, ...secondPage.stories].map((story) => story.id)).size, 27);
});


test('public policy text and AI training controls are available without authentication', async () => {
  const response = await fetch(`${baseUrl}/politicas`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Esta história utiliza IA/);
  assert.match(html, /Capa gerada com IA/);
  assert.match(html, /advertência/);
  assert.match(html, /<h2[^>]*>Um espaço gratuito para histórias<\/h2>/);
  assert.match(html, /não utiliza nem licencia/);
  assert.doesNotMatch(html, /PREENCHER/);
  const login = await fetch(`${baseUrl}/login`);
  assert.match(await login.text(), /href="\/politicas"/);
  const robots = await fetch(`${baseUrl}/robots.txt`);
  assert.equal(robots.status, 200);
  const text = await robots.text();
  for (const agent of ['GPTBot', 'ClaudeBot', 'Google-Extended']) assert.match(text, new RegExp(`User-Agent: ${agent}\\n(?:User-Agent: [^\\n]+\\n)*Disallow: /`, 'i'));
});


test('reader preferences round-trip by authenticated account and reject foreign ownership and unsafe values', async () => {
  const token = 'reader-preferences-session';
  state.sessions.push({ user_id: userId, token_hash: hash(token), expires_at: new Date(Date.now()+60000).toISOString() });
  const headers = { Cookie: `toriland_session=${token}`, 'Content-Type': 'application/json', 'X-Reader-Account': userId };
  const preferences = { fontId:'literata', fontSize:24, lineHeight:1.8, margin:32, theme:'sepia' };
  const save = (body, customHeaders = headers) => fetch(`${baseUrl}/api/reader/preferences`, { method:'PUT', headers:customHeaders, body:JSON.stringify(body) });
  assert.equal((await save(preferences, { 'Content-Type':'application/json' })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/reader/preferences`)).status, 401);
  assert.equal((await save({ ...preferences, user_id:otherUserId })).status, 400);
  assert.equal((await save({ ...preferences, fontId:'arbitrary-css' })).status, 400);
  assert.equal((await save({ ...preferences, fontSize:1000 })).status, 400);
  assert.equal((await save(preferences, { ...headers, 'X-Reader-Account':otherUserId })).status, 409);
  assert.equal((await save(preferences)).status, 200);
  const response = await fetch(`${baseUrl}/api/reader/preferences?user_id=${otherUserId}`, { headers });
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.deepEqual(await response.json(), { user_id:userId, preferences });
  assert.equal(state.readerPreferences.has(otherUserId), false);
  state.readerUnavailable = true;
  try {
    const unavailable = await fetch(`${baseUrl}/api/reader/preferences`, { headers });
    assert.equal(unavailable.status, 503);
    assert.equal((await unavailable.json()).user_id, userId);
    assert.equal((await save(preferences)).status, 503);
  } finally { state.readerUnavailable = false; }
});


test('personalized discovery and progress require authentication and public entry pages expose separate navigation', async () => {
  for (const path of ['/api/discovery','/api/discovery/preferences','/api/reading-progress?chapter=00000000-0000-0000-0000-000000000301']) assert.equal((await fetch(baseUrl+path)).status,401,path);
  for (const [path,method] of [['/api/discovery/preferences','PUT'],['/api/reading-progress','PUT'],['/api/discovery/activity','POST'],['/api/events','PATCH']]) assert.equal((await fetch(baseUrl+path,{method,headers:{'Content-Type':'application/json'},body:'{}'})).status,401,path);
  for(const path of ['/inicio','/preferencias','/eventos']) { const response=await fetch(baseUrl+path);assert.equal(response.status,200);const text=await response.text();assert.match(text,/href="\/inicio"/);assert.match(text,/href="\/feed"/);assert.match(text,/Abrir menu de navegação/); }
});

test('fandom preferences round-trip with account ownership, reject injected owners and suspended accounts', async () => {
  const token='discovery-preferences-session';state.sessions.push({user_id:userId,token_hash:hash(token),expires_at:new Date(Date.now()+60000).toISOString()});
  const headers={Cookie:'toriland_session='+token,'Content-Type':'application/json','X-Discovery-Account':userId};
  const save=(body,extra={})=>fetch(baseUrl+'/api/discovery/preferences',{method:'PUT',headers:{...headers,...extra},body:JSON.stringify(body)});
  assert.equal((await save({favorite_fandoms:['Harry Potter'],user_id:otherUserId})).status,400);
  assert.equal((await save({favorite_fandoms:['Harry Potter']},{'X-Discovery-Account':otherUserId})).status,409);
  assert.equal((await save({favorite_fandoms:['x'.repeat(101)]})).status,400);
  assert.equal((await save({favorite_fandoms:['Harry Potter']})).status,200);
  const response=await fetch(baseUrl+'/api/discovery/preferences?user_id='+otherUserId,{headers});assert.match(response.headers.get('cache-control'),/no-store/);
  const data=await response.json();assert.deepEqual(data.favorite_fandoms,['Harry Potter']);assert.equal(data.account_id,userId);assert.equal(state.discoveryPreferences.has(otherUserId),false);
  const invalid=await fetch(baseUrl+'/api/reading-progress',{method:'PUT',headers,body:JSON.stringify({chapter_id:'invalid',story_id:'invalid',percent:200})});assert.equal(invalid.status,400);
  state.account.account_status='suspended';try{assert.equal((await save({favorite_fandoms:['Marvel']})).status,401);}finally{state.account.account_status='active';}
});


test('chat, media and privacy changes require authentication and reject foreign origins',async()=>{
 for(const path of ['/api/support','/api/profile/control?target=00000000-0000-0000-0000-000000000301','/api/chat','/api/chat/media/00000000-0000-0000-0000-000000000301','/api/profile/privacy','/api/follows/requests','/api/chapters/00000000-0000-0000-0000-000000000301/favorite'])assert.equal((await fetch(baseUrl+path)).status,401,path);
 for(const path of ['/api/chat','/api/chat/groups','/api/chat/groups/invitations','/api/chat/groups/join','/api/chat/reports','/api/profile/control','/api/support','/api/moderation/warnings','/api/follows'])assert.equal((await fetch(baseUrl+path,{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'})).status,403,path);
 assert.equal((await fetch(baseUrl+'/api/moderation/inbox',{method:'PATCH',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'})).status,403);
 for(const path of ['/api/chat/groups','/api/chat/groups/invitations','/api/chat/groups/join','/api/profile/control','/api/support','/api/moderation/warnings'])assert.equal((await fetch(baseUrl+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401,path);
 const invalid=await fetch(baseUrl+'/api/content-media?bucket=private-chat&path=someone.enc');assert.equal(invalid.status,400);assert.match(invalid.headers.get('cache-control'),/no-store/);
 const page=await fetch(baseUrl+'/fandoms');const text=await page.text();assert.equal(page.status,200);assert.match(text,/Criar fandom/);assert.match(text,/mailto:appnookie@gmail.com/);assert.match(text,/tiktok.com\/@nooklie.com/);
});

test('notifications route renders an inbox and reads only the signed-in account notifications', async () => {
  const page=await fetch(baseUrl+'/notificacoes');assert.equal(page.status,200);const html=await page.text();
  assert.match(html,/<h1\b[^>]*>Notificações<\/h1>/);assert.match(html,/Carregando suas notificações/);
  assert.doesNotMatch(html,/Olá, Alaska|Entre Dois Mundos|Depois da Meia-Noite|12,4 mil|Acabaram de chegar ao Toriland/);
  assert.equal((await fetch(baseUrl+'/api/notifications')).status,401);
  const token='notification-inbox-session';state.sessions.push({user_id:userId,token_hash:hash(token),expires_at:new Date(Date.now()+60000).toISOString()});
  const headers={Cookie:'toriland_session='+token,'Content-Type':'application/json'};
  state.notifications=[{id:'notification-own',user_id:userId,title:'Atualização da sua conta',body:'Mensagem real',href:'/inicio',created_at:new Date().toISOString(),read_at:null},{id:'notification-other',user_id:otherUserId,title:'Privada',body:'Outra conta',created_at:new Date().toISOString(),read_at:null}];
  const inbox=await fetch(baseUrl+'/api/notifications?user_id='+otherUserId,{headers});const data=await inbox.json();assert.deepEqual(data.notifications.map(item=>item.id),['notification-own']);assert.equal(data.unread_count,1);
  const summary = await fetch(baseUrl + '/api/notifications?summary=1&user_id=' + otherUserId, { headers });
  assert.match(summary.headers.get('cache-control'), /no-store/);
  assert.deepEqual(await summary.json(), { unread_count: 1 });
  const foreign=await fetch(baseUrl+'/api/notifications',{method:'PATCH',headers,body:JSON.stringify({id:'notification-other'})});assert.equal(foreign.status,200);assert.equal(state.notifications[1].read_at,null);
  assert.equal((await fetch(baseUrl+'/api/notifications',{method:'PATCH',headers,body:JSON.stringify({all:true})})).status,200);
  const refreshed=await (await fetch(baseUrl+'/api/notifications',{headers})).json();assert.equal(refreshed.unread_count,0);assert.equal(state.notifications[1].read_at,null);
});

test('credential routes reject cross-site requests and oversized new passwords', async () => {
  const headers = { 'Content-Type': 'application/json' };
  for (const path of ['/api/auth/login', '/api/auth/signup', '/api/auth/recover', '/api/stories']) {
    const response = await fetch(baseUrl + path, {
      method: 'POST', headers: { ...headers, Origin: 'https://foreign.example' }, body: '{}',
    });
    assert.equal(response.status, 403, path);
  }
  const response = await fetch(baseUrl + '/api/auth/signup', {
    method: 'POST',
    headers: { ...headers, Origin: baseUrl },
    body: JSON.stringify({ username: 'owner', password: 'á'.repeat(37) }),
  });
  assert.equal(response.status, 400);
  assert.match(await response.text(), /72 bytes/);
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('anonymous readers cannot fetch a social Story image from the media proxy', async () => {
  const response = await fetch(baseUrl + '/api/content-media?bucket=social-stories&path=user-other%2Fstory.png');
  assert.equal(response.status, 404);
  assert.match(response.headers.get('cache-control'), /private/);
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('image upload endpoints reject executable bytes disguised as PNG before writing to Storage', async () => {
  const token = 'upload-check-session';
  state.sessions.push({user_id:userId,token_hash:hash(token),expires_at:new Date(Date.now()+60_000).toISOString()});
  for (const endpoint of ['/api/profile/avatar','/api/profile/cover','/api/stickers']) {
    const body = new FormData();
    body.set('file',new File(['<svg onload="alert(1)"></svg>'],'fake.png',{type:'image/png'}));
    const result = await fetch(baseUrl+endpoint,{method:'POST',headers:{Cookie:`toriland_session=${token}`},body});
    assert.equal(result.status,415,endpoint);
  }
});

test('creating a Portuguese catalogue tag reuses its existing English slug', async () => {
  state.tags.push({id:'seed-thriller',name:'Suspense',slug:'thriller',category_id:categoryIds.genre});
  const token = 'translated-tag-session';
  state.sessions.push({user_id:userId,token_hash:hash(token),expires_at:new Date(Date.now()+60_000).toISOString()});
  const before = state.tags.length;
  const response = await fetch(baseUrl+'/api/tags',{method:'POST',headers:{'Content-Type':'application/json',Cookie:`toriland_session=${token}`},body:JSON.stringify({name:'suspense',category:'genre'})});
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.created,false);assert.equal(result.tag.slug,'thriller');assert.equal(state.tags.length,before);
});

test('the newspaper publishes the update and every article exposes its own comments section',async()=>{
 for(const slug of ['boas-vindas','originais','atualizacao-6-novembro-2026']){
  const response=await fetch(baseUrl+'/noticias/'+slug);assert.equal(response.status,200,slug);const html=await response.text();assert.match(html,/Comentários da notícia/);if(slug==='atualizacao-6-novembro-2026')assert.match(html,/Vocês testaram, nós ouvimos/);
 }
 const response=await fetch(baseUrl+'/api/news/comments?article=boas-vindas');assert.equal(response.status,200);assert.deepEqual((await response.json()).comments,[]);assert.match(response.headers.get('cache-control'),/private/);
 assert.equal((await fetch(baseUrl+'/api/news/comments?article=unknown')).status,404);
 assert.equal((await fetch(baseUrl+'/api/news/comments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({article:'boas-vindas',body:'x'})})).status,401);
 assert.equal((await fetch(baseUrl+'/api/news/comments',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://foreign.example'},body:'{}'})).status,403);
});
