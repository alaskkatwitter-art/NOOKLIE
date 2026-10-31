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
const state = { account: null, sessions: [], chapters: [], collaborators: [], storyCredits: [], deactivatedAt: null, anonymousStoryIds: [], reviews: [], reviewLikes: [], reviewComments: [], blocks: [], notifications: [], rateLimits: new Map(), categories, tags: [], discoveryStories: [], storyTags: [] };

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
    { id: 'story-filter-one', author_id: userId, title: 'Dragões e Romance', description: 'Uma aventura', cover_url: null, status: 'Concluída', rating: '12', created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-02T00:00:00.000Z' },
    { id: 'story-filter-two', author_id: userId, title: 'Fantasia sombria', description: 'Um mistério', cover_url: null, status: 'Em andamento', rating: '18', created_at: '2026-10-03T00:00:00.000Z', updated_at: '2026-10-04T00:00:00.000Z' },
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

    if (path === 'rpc/consume_auth_rate_limit' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const { p_key_hash, p_limit } = JSON.parse(body);
      const count = (state.rateLimits.get(p_key_hash) || 0) + 1;
      state.rateLimits.set(p_key_hash, count);
      return sendJson(response, count <= p_limit);
    }

    if (path === 'rpc/search_public_stories' && request.method === 'POST') {
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

    if (path === 'rpc/leave_story_collaboration' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      const session = state.sessions.find((item) => item.token_hash === input.p_session_token_hash && new Date(item.expires_at).getTime() > Date.now());
      if (!session) return sendJson(response, { code: '42501' }, 403);
      const membership = state.collaborators.find((item) => item.story_id === input.p_story_id && item.profile_id === session.user_id && item.role === input.p_role && item.status === 'active');
      if (!membership) return sendJson(response, { code: 'P0002' }, 400);
      membership.status = 'left'; membership.removed_at = new Date().toISOString();
      if (input.p_role !== 'coauthor') {
        const credit = state.storyCredits.find((item) => item.story_id === input.p_story_id && item.contributor_id === session.user_id && item.role === input.p_role && ['pending', 'accepted'].includes(item.status));
        if (credit) { credit.status = 'withdrawn'; credit.decided_at = new Date().toISOString(); }
      }
      return sendJson(response, { left: true, role: input.p_role });
    }

    if (path === 'tag_categories' && request.method === 'GET') {
      let rows = state.categories;
      const slug = (url.searchParams.get('slug') || '').replace(/^eq\./, '');
      if (slug) rows = rows.filter((category) => category.slug === slug);
      return respondRows(request, response, rows);
    }

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
        return { ...relation, tags: tag ? { ...tag, tag_categories: category ? { name: category.name } : null } : null };
      });
      return respondRows(request, response, rows);
    }

    if (path === 'profiles' && request.method === 'GET') {
      const profiles = [
        { id: userId, user_id: userId, username: 'owner', display_name: 'Owner', avatar_url: null, verified: false, deactivated_at: state.deactivatedAt, moderation_hidden_at: null },
        { id: otherUserId, user_id: otherUserId, username: 'reader', display_name: 'Reader', avatar_url: null, verified: false, deactivated_at: null, moderation_hidden_at: null },
      ];
      const idFilter = url.searchParams.get('id') || '';
      const userFilter = url.searchParams.get('user_id') || '';
      const filterList = (filter) => filter.startsWith('in.(') ? filter.slice(4, -1).split(',') : filter.startsWith('eq.') ? [filter.slice(3)] : [];
      let rows = profiles;
      if (idFilter) rows = rows.filter((profile) => filterList(idFilter).includes(profile.id));
      if (userFilter) rows = rows.filter((profile) => filterList(userFilter).includes(profile.user_id));
      return respondRows(request, response, rows);
    }

    if (path === 'auth_accounts' && request.method === 'GET') {
      const username = (url.searchParams.get('username') || '').replace(/^eq\./, '');
      const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
      const rows = username === state.account.username || id === state.account.id ? [state.account]
        : id === otherUserId ? [{ id: otherUserId, account_status: 'active' }] : [];
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

    if (path === 'stories' && request.method === 'GET') {
      if ((url.searchParams.get('select') || '').includes('is_anonymous')) {
        const ids = (url.searchParams.get('id') || '').replace(/^in\.\(/, '').replace(/\)$/, '').split(',');
        return sendJson(response, state.discoveryStories.filter((story) => ids.includes(story.id)).map((story) => ({ id: story.id, is_anonymous: state.anonymousStoryIds.includes(story.id) })));
      }
      const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
      const rows = id === storyId ? [{ id: storyId, author_id: userId, moderation_hidden_at: null, hidden_by_deactivation: false }] : [];
      return respondRows(request, response, rows);
    }

    if (path === 'user_blocks' && request.method === 'GET') {
      const list = (filter) => filter.startsWith('in.(') ? filter.slice(4, -1).split(',') : filter.startsWith('eq.') ? [filter.slice(3)] : [];
      const blockerList = list(url.searchParams.get('blocker_id') || '');
      const blockedList = list(url.searchParams.get('blocked_id') || '');
      let rows = state.blocks;
      if (url.searchParams.has('blocker_id')) rows = rows.filter((item) => blockerList.includes(item.blocker_id));
      if (url.searchParams.has('blocked_id')) rows = rows.filter((item) => blockedList.includes(item.blocked_id));
      return respondRows(request, response, rows);
    }

    if (path === 'story_reviews' && request.method === 'GET') {
      const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
      const story = (url.searchParams.get('story_id') || '').replace(/^eq\./, '');
      let rows = state.reviews;
      if (id) rows = rows.filter((item) => item.id === id);
      if (story) rows = rows.filter((item) => item.story_id === story);
      return respondRows(request, response, rows);
    }

    if (path === 'review_likes' && ['GET', 'HEAD'].includes(request.method)) {
      const reviewFilter = url.searchParams.get('review_id') || '';
      const userFilter = (url.searchParams.get('user_id') || '').replace(/^eq\./, '');
      const ids = reviewFilter.startsWith('in.(') ? reviewFilter.slice(4, -1).split(',') : reviewFilter.startsWith('eq.') ? [reviewFilter.slice(3)] : [];
      let rows = state.reviewLikes.filter((item) => ids.includes(item.review_id));
      if (userFilter) rows = rows.filter((item) => item.user_id === userFilter);
      if ((request.headers.prefer || '').includes('count=exact')) {
        response.writeHead(200, { 'content-range': `0-0/${rows.length}` });
        return response.end();
      }
      return respondRows(request, response, rows);
    }
    if (path === 'review_likes' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const item = JSON.parse(body);
      if (!state.reviewLikes.some((like) => like.review_id === item.review_id && like.user_id === item.user_id)) state.reviewLikes.push({ id: `like-${state.reviewLikes.length + 1}`, ...item });
      response.writeHead(201); return response.end();
    }
    if (path === 'review_likes' && request.method === 'DELETE') {
      const review = (url.searchParams.get('review_id') || '').replace(/^eq\./, '');
      const user = (url.searchParams.get('user_id') || '').replace(/^eq\./, '');
      state.reviewLikes = state.reviewLikes.filter((item) => item.review_id !== review || item.user_id !== user);
      response.writeHead(204); return response.end();
    }

    if (path === 'review_comments' && request.method === 'GET') {
      const review = (url.searchParams.get('review_id') || '').replace(/^eq\./, '');
      const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
      let rows = state.reviewComments.filter((item) => item.review_id === review);
      if (id) rows = rows.filter((item) => item.id === id);
      return respondRows(request, response, rows);
    }
    if (path === 'review_comments' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      const item = { id: `review-comment-${state.reviewComments.length + 1}`, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...JSON.parse(body) };
      state.reviewComments.push(item);
      return respondRows(request, response, [item], 201);
    }
    if (path === 'review_comments' && request.method === 'DELETE') {
      const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
      state.reviewComments = state.reviewComments.filter((item) => item.id !== id);
      response.writeHead(204); return response.end();
    }

    if (path === 'user_notifications' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk;
      state.notifications.push(JSON.parse(body));
      response.writeHead(201); return response.end();
    }

    if (path === 'story_collaborators' && request.method === 'GET') {
      const storyFilter = (url.searchParams.get('story_id') || '').replace(/^eq\./, '');
      const profileFilter = (url.searchParams.get('profile_id') || '').replace(/^eq\./, '');
      const roleFilter = (url.searchParams.get('role') || '').replace(/^eq\./, '');
      const statusFilter = (url.searchParams.get('status') || '').replace(/^eq\./, '');
      let rows = state.collaborators;
      if (storyFilter) rows = rows.filter((item) => item.story_id === storyFilter);
      if (profileFilter) rows = rows.filter((item) => item.profile_id === profileFilter);
      if (roleFilter) rows = rows.filter((item) => item.role === roleFilter);
      if (statusFilter) rows = rows.filter((item) => item.status === statusFilter);
      if ((url.searchParams.get('select') || '').includes('story:stories')) rows = rows.map((item) => ({ ...item, story: { title: item.story_title || 'História de teste' } }));
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

test('content-warning correction requests stay private to authors and authorized moderation staff', async () => {
  const authorRead = await fetch(`${baseUrl}/api/account/content-warning-corrections`);
  assert.equal(authorRead.status, 401);

  const authorSubmit = await fetch(`${baseUrl}/api/account/content-warning-corrections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'correction-1', author_response: 'Adicionei os avisos solicitados.' }),
  });
  assert.equal(authorSubmit.status, 401);

  const moderationRead = await fetch(`${baseUrl}/api/admin/content-warning-corrections`);
  assert.equal(moderationRead.status, 401);
  const moderationCreate = await fetch(`${baseUrl}/api/admin/content-warning-corrections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ story_id: 'story-1', missing_warnings: ['violence'], notice: 'Add a warning.', due_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() }),
  });
  assert.equal(moderationCreate.status, 401);
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

  state.collaborators.push({ story_id: storyId, profile_id: otherUserId, role: 'coauthor', status: 'active' });
  state.chapters.push({ id: 'chapter-existing-two', story_id: storyId, chapter_number: 2 });
  const coauthorCanEdit = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `toriland_session=${otherToken}` },
    body: JSON.stringify(payload),
  });
  assert.equal(coauthorCanEdit.status, 201);
  assert.equal((await coauthorCanEdit.json()).chapter.chapter_number, 3);
  state.collaborators = [];

  const ownerToken = 'owner-session-token';
  state.sessions.push({ user_id: userId, token_hash: hash(ownerToken), expires_at: new Date(Date.now() + 60_000).toISOString() });
  state.deactivatedAt = new Date().toISOString();
  const deactivatedCannotInteract = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `toriland_session=${ownerToken}` },
    body: JSON.stringify(payload),
  });
  assert.equal(deactivatedCannotInteract.status, 401);
  state.deactivatedAt = null;
  state.chapters.push({ id: 'chapter-existing', story_id: storyId, chapter_number: 2 });
  const created = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `toriland_session=${ownerToken}` },
    body: JSON.stringify(payload),
  });
  assert.equal(created.status, 201);
  const result = await created.json();
  assert.equal(result.chapter.chapter_number, 4);
  assert.equal(result.chapter.title, 'Novo capítulo');
});

test('collaborators can leave only their own role and withdraw a confirmed credit', async () => {
  const otherToken = 'designer-collaboration-session';
  const ownerToken = 'owner-session-token';
  const collaborationStoryId = '00000000-0000-4000-8000-000000000001';
  state.sessions.push({ user_id: otherUserId, token_hash: hash(otherToken), expires_at: new Date(Date.now() + 60_000).toISOString() });
  if (!state.sessions.some((session) => session.token_hash === hash(ownerToken))) {
    state.sessions.push({ user_id: userId, token_hash: hash(ownerToken), expires_at: new Date(Date.now() + 60_000).toISOString() });
  }
  state.collaborators.push({ id: 'designer-membership', story_id: collaborationStoryId, profile_id: otherUserId, role: 'designer', status: 'active', story_title: 'História colaborativa' });
  state.storyCredits.push({ story_id: collaborationStoryId, contributor_id: otherUserId, role: 'designer', status: 'accepted' });

  const list = await fetch(`${baseUrl}/api/account/collaborations`, { headers: { Cookie: `toriland_session=${otherToken}` } });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).collaborations[0].story_title, 'História colaborativa');

  const unauthorized = await fetch(`${baseUrl}/api/account/collaborations`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', Cookie: `toriland_session=${ownerToken}` },
    body: JSON.stringify({ story_id: collaborationStoryId, role: 'designer' }),
  });
  assert.equal(unauthorized.status, 404);
  assert.equal(state.collaborators[0].status, 'active');

  const withdrawn = await fetch(`${baseUrl}/api/account/collaborations`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', Cookie: `toriland_session=${otherToken}` },
    body: JSON.stringify({ story_id: collaborationStoryId, role: 'designer' }),
  });
  assert.equal(withdrawn.status, 200);
  assert.deepEqual(await withdrawn.json(), { left: true, role: 'designer' });
  assert.equal(state.collaborators[0].status, 'left');
  assert.equal(state.storyCredits[0].status, 'withdrawn');
  state.collaborators = [];
  state.storyCredits = [];
});

test('readers can like and discuss a review while spoiler comments stay labeled and manageable', async () => {
  const reviewId = 'review-one';
  const otherToken = 'review-owner-session';
  state.sessions.push({ user_id: otherUserId, token_hash: hash(otherToken), expires_at: new Date(Date.now() + 60_000).toISOString() });
  state.reviews.push({ id: reviewId, story_id: storyId, reviewer_id: otherUserId, contains_spoilers: true });

  const ownReviewLike = await fetch(`${baseUrl}/api/reviews/${reviewId}/likes`, {
    method: 'POST', headers: { Cookie: `toriland_session=${otherToken}` },
  });
  assert.equal(ownReviewLike.status, 403);

  const likeUrl = `${baseUrl}/api/reviews/${reviewId}/likes`;
  const liked = await fetch(likeUrl, { method: 'POST', headers: { Cookie: `toriland_session=owner-session-token` } });
  assert.equal(liked.status, 200);
  assert.deepEqual(await liked.json(), { liked: true, count: 1 });
  const duplicateLike = await fetch(likeUrl, { method: 'POST', headers: { Cookie: `toriland_session=owner-session-token` } });
  assert.equal((await duplicateLike.json()).count, 1);

  const commentsUrl = `${baseUrl}/api/reviews/${reviewId}/comments`;
  const created = await fetch(commentsUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `toriland_session=owner-session-token` },
    body: JSON.stringify({ body: 'A reviravolta do final é muito boa.', contains_spoilers: true }),
  });
  assert.equal(created.status, 201);
  const comment = (await created.json()).comment;
  assert.equal(comment.contains_spoilers, true);
  assert.equal(state.notifications.length, 1);

  const protectedComments = await fetch(commentsUrl);
  assert.equal(protectedComments.status, 403);
  const listed = await fetch(`${commentsUrl}?reveal_spoilers=1`);
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).comments[0].contains_spoilers, true);

  const removed = await fetch(`${commentsUrl}?comment_id=${comment.id}`, {
    method: 'DELETE', headers: { Cookie: `toriland_session=owner-session-token` },
  });
  assert.equal(removed.status, 200);
  assert.equal(state.reviewComments.length, 0);

  const unliked = await fetch(likeUrl, { method: 'DELETE', headers: { Cookie: `toriland_session=owner-session-token` } });
  assert.deepEqual(await unliked.json(), { liked: false, count: 0 });
});


test('discovery applies included and excluded tags, rating, status, and sort', async () => {
  state.anonymousStoryIds.push('story-filter-one');
  const response = await fetch(
    `${baseUrl}/api/explore?includeTag=fantasia&includeTag=romance&excludeTag=terror&rating=12&status=${encodeURIComponent('Concluída')}&sort=newest`,
  );
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.stories.map((story) => story.id), ['story-filter-one']);
  assert.deepEqual(result.stories[0].tags.map((tag) => tag.slug).sort(), ['fantasia', 'romance']);
  assert.equal(result.stories[0].author, null);
  assert.equal(result.stories[0].author_label, 'Autor anônimo');
  state.anonymousStoryIds = [];
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
