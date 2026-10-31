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
const state = { account: null, sessions: [], chapters: [], rateLimits: new Map() };

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
  };

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

    if (path === 'auth_accounts' && request.method === 'GET') {
      const username = (url.searchParams.get('username') || '').replace(/^eq\./, '');
      const rows = username === state.account.username ? [state.account] : [];
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
      const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
      const rows = id === storyId ? [{ id: storyId, author_id: userId }] : [];
      return respondRows(request, response, rows);
    }

    if (path === 'chapters' && request.method === 'GET') {
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
