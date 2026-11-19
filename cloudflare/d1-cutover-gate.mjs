export async function cutoverPaused(db) {
  return (await db.prepare("SELECT value FROM d1_runtime_flags WHERE key='cutover_paused'").first())?.value === '1';
}

export async function cutoverFetch(worker, request, env, ctx) {
  if (!env.NOOKLIE_DB) throw Error('D1 production binding missing');
  if (await cutoverPaused(env.NOOKLIE_DB)) {
    const token = request.headers.get('x-nooklie-cutover-test');
    const expected = token && (await env.NOOKLIE_DB.prepare("SELECT value FROM d1_runtime_flags WHERE key='cutover_test_sha256'").first())?.value;
    const actual = token && Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))), byte => byte.toString(16).padStart(2, '0')).join('');
    if (!expected || actual !== expected) return Response.json({ error: 'O Nooklie está em manutenção. Tente novamente em alguns minutos.' }, { status: 503, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store', 'X-Nooklie-Database': 'd1' } });
  }
  const result = await worker.fetch(request, env, ctx);
  const response = new Response(result.body, result);
  response.headers.set('X-Nooklie-Database', 'd1');
  return response;
}
