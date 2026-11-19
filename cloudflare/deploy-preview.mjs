import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const output = '.cloudflare/output/v0/workers/default';
const production = process.env.NOOKLIE_CLOUDFLARE_PRODUCTION === '1';
const args = process.argv.slice(2);
const prepareD1Production = args.includes('--prepare-d1-production');
const dryRun = args.includes('--dry-run');
if (new Set(args).size !== args.length || args.some(arg => !['--dry-run', '--prepare-d1-production'].includes(arg))) {
  throw new Error('Supported options: --dry-run and --prepare-d1-production.');
}
if (prepareD1Production && (!production || process.env.NOOKLIE_D1_MIGRATION === '1' ||
    process.env.NOOKLIE_D1_SMOKE_PREVIEW === '1' || process.env.NOOKLIE_D1_PREVIEW_FEATURES)) {
  throw new Error('Production D1 preparation requires production settings without preview flags.');
}
const reusePreviewSecrets = process.env.NOOKLIE_REUSE_PREVIEW_SECRETS === '1';
if (reusePreviewSecrets && production) {
  throw new Error('The preview secret option applies only to nooklie-preview.');
}
const config = JSON.parse(readFileSync('wrangler.preview.json', 'utf8'));
const supabaseUrl = production
  ? 'https://fwwgoyburkdybbqmvljk.supabase.co'
  : 'https://vbjjxabtrdwhanektrfa.supabase.co';

if (config.name !== 'nooklie-preview') {
  throw new Error('Unexpected base Worker configuration.');
}
config.vars = {
  NOOKLIE_CLOUDFLARE_RUNTIME: '1',
  NOOKLIE_MEDIA_ORIGIN: production
    ? 'https://nooklie.nooklie-the-app.workers.dev'
    : 'https://nooklie-preview.nooklie-the-app.workers.dev',
};
config.r2_buckets = [{
  binding: 'NOOKLIE_MEDIA',
  bucket_name: production ? 'nooklie-media' : 'nooklie-preview-media',
}];
// Opt-in for an isolated migration preview only. This does not switch any route
// to D1 and must never attach the migration database to production accidentally.
if (process.env.NOOKLIE_D1_MIGRATION === '1') {
  if (production) throw new Error('D1 migration preview cannot target production.');
  const target = JSON.parse(readFileSync('d1/target.json', 'utf8'));
  const smoke = process.env.NOOKLIE_D1_SMOKE_PREVIEW === '1';
  config.r2_buckets.push({ binding: 'NOOKLIE_HISTORICAL_MEDIA', bucket_name: 'nooklie-media' });

  config.d1_databases = [{
    binding: target.binding,
    database_name: smoke ? 'nooklie-d1-preview-smoke' : target.database_name,
    database_id: smoke ? 'fee77d4a-6f97-4440-81d2-e3a71a305b8d' : target.database_id,
  }];
}
const d1Features=prepareD1Production ? 'auth,news,wiki,themes' : process.env.NOOKLIE_D1_PREVIEW_FEATURES;
if(d1Features && !prepareD1Production){
  if(production||process.env.NOOKLIE_D1_MIGRATION!=='1'||d1Features.split(',').some(f=>!['auth','news','wiki','themes'].includes(f)))throw Error('D1 features require isolated migration preview');
  config.vars.NOOKLIE_D1_PREVIEW='1';config.vars.NOOKLIE_D1_PREVIEW_FEATURES=d1Features;
}
if (production) {
  config.name = 'nooklie';
  config.vars.NOOKLIE_CLOUDFLARE_PRODUCTION = '1';
  if (prepareD1Production) {
    const target = JSON.parse(readFileSync('d1/target.json', 'utf8'));
    config.d1_databases = [{ binding: target.binding, database_name: target.database_name, database_id: target.database_id }];
    config.r2_buckets.push({ binding: 'NOOKLIE_HISTORICAL_MEDIA', bucket_name: 'nooklie-media' });
    config.vars.NOOKLIE_D1_PRODUCTION = '1';
    config.vars.NOOKLIE_D1_PREVIEW_FEATURES = d1Features;
  }
  // Enable a public route only after reviewing the protected production candidate.
  config.workers_dev = process.env.NOOKLIE_WORKERS_DEV === '1';
  Object.assign(config.vars, {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  config.observability.traces = { enabled: true, head_sampling_rate: 0.01 };
  config.placement = { region: 'aws:us-east-2' };
}
const previewKeys = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  process.env.CHAT_ENCRYPTION_KEY_V2 === undefined ? 'CHAT_ENCRYPTION_KEY' : 'CHAT_ENCRYPTION_KEY_V2',
];
const previewSecrets = Object.fromEntries(previewKeys.map(name => [name, process.env[name]]));
const validPublicConfig = process.env.NEXT_PUBLIC_SUPABASE_URL === supabaseUrl &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_');
const validTargetConfig = production
  ? process.env.NEXT_PUBLIC_SITE_URL === 'https://nooklie.nooklie-the-app.workers.dev'
  : previewSecrets.SUPABASE_SECRET_KEY?.startsWith('sb_secret_') &&
    /^[a-f0-9]{64}$/i.test(previewSecrets[previewKeys.at(-1)] ?? '');
if (!dryRun && !reusePreviewSecrets && (!validPublicConfig || !validTargetConfig)) {
  throw new Error('The Nooklie Worker configuration is incomplete or targets the wrong database.');
}

// Export the already-built modules to a standalone Wrangler project.
const directory = mkdtempSync(join(tmpdir(), 'nooklie-worker-preview-'));
try {
  for (const part of ['bundle', 'assets']) {
    cpSync(join(output, part), join(directory, part), { recursive: true });
  }
  if (d1Features?.split(',').includes('auth')) {
    cpSync('cloudflare/d1-scheduled.mjs', join(directory, 'bundle/d1-scheduled.mjs'));
    if (prepareD1Production) cpSync('cloudflare/d1-cutover-gate.mjs', join(directory, 'bundle/d1-cutover-gate.mjs'));
    writeFileSync(join(directory, 'bundle/d1-preview-entry.js'), `
      import worker from './index.js';
      import { publishScheduledChapters } from './d1-scheduled.mjs';
      ${prepareD1Production ? "import { cutoverFetch, cutoverPaused } from './d1-cutover-gate.mjs';" : ''}
      export * from './index.js';
      export default {
        ...worker,
        fetch: ${prepareD1Production ? '(request, env, ctx) => cutoverFetch(worker, request, env, ctx)' : 'worker.fetch.bind(worker)'},
        scheduled(controller, env, ctx) {
          ctx.waitUntil(${prepareD1Production ? '(async () => { if (!await cutoverPaused(env.NOOKLIE_DB)) await publishScheduledChapters(env.NOOKLIE_DB, controller.scheduledTime); })()' : 'publishScheduledChapters(env.NOOKLIE_DB, controller.scheduledTime)'});
        },
      };
    `);
    config.main = './bundle/d1-preview-entry.js';
    if (!prepareD1Production) config.triggers = { crons: ['* * * * *'] };
  }
  writeFileSync(join(directory, 'wrangler.json'), JSON.stringify(config));
  const uploadPreviewSecrets = !dryRun && !production && !reusePreviewSecrets;
  if (uploadPreviewSecrets) {
    writeFileSync(join(directory, 'worker-secrets.json'), JSON.stringify(previewSecrets), { mode: 0o600 });
  }
  const wranglerArgs = ['--yes', '--package=wrangler@4.158.0', 'wrangler', ...(prepareD1Production ? ['versions', 'upload'] : ['deploy']),
    '--config', 'wrangler.json', ...(uploadPreviewSecrets ? ['--secrets-file', 'worker-secrets.json'] : []),
    ...(prepareD1Production ? [] : ['--no-autoconfig']), '--keep-vars', ...(dryRun ? ['--dry-run'] : [])];
  const child = spawnSync('npx', wranglerArgs, { cwd: directory, stdio: 'inherit' });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
