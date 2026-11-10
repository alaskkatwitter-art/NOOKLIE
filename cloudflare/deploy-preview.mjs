import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const output = '.cloudflare/output/v0/workers/default';
const production = process.env.NOOKLIE_CLOUDFLARE_PRODUCTION === '1';
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--dry-run')) {
  throw new Error('The only supported option is --dry-run.');
}
const dryRun = args.length === 1;
const config = JSON.parse(readFileSync('wrangler.preview.json', 'utf8'));
const supabaseUrl = production
  ? 'https://fwwgoyburkdybbqmvljk.supabase.co'
  : 'https://vbjjxabtrdwhanektrfa.supabase.co';

if (config.name !== 'nooklie-preview') {
  throw new Error('Unexpected base Worker configuration.');
}
config.vars = { NOOKLIE_CLOUDFLARE_RUNTIME: '1' };
if (production) {
  config.name = 'nooklie';
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
if (!dryRun && (!validPublicConfig || !validTargetConfig)) {
  throw new Error('The Nooklie Worker configuration is incomplete or targets the wrong database.');
}

// Export the already-built modules to a standalone Wrangler project.
const directory = mkdtempSync(join(tmpdir(), 'nooklie-worker-preview-'));
try {
  for (const part of ['bundle', 'assets']) {
    cpSync(join(output, part), join(directory, part), { recursive: true });
  }
  writeFileSync(join(directory, 'wrangler.json'), JSON.stringify(config));
  // The production credentials already live in Worker settings and stay there.
  if (!dryRun && !production) {
    writeFileSync(join(directory, 'worker-secrets.json'), JSON.stringify(previewSecrets), { mode: 0o600 });
  }
  const wranglerArgs = ['--yes', '--package=wrangler@4.158.0', 'wrangler', 'deploy',
    '--config', 'wrangler.json', ...(dryRun || production ? [] : ['--secrets-file', 'worker-secrets.json']),
    '--no-autoconfig', '--keep-vars', ...args];
  const child = spawnSync('npx', wranglerArgs, { cwd: directory, stdio: 'inherit' });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
