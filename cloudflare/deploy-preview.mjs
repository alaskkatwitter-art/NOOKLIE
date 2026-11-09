import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const output = '.cloudflare/output/v0/workers/default';
const config = JSON.parse(readFileSync('wrangler.preview.json', 'utf8'));
const names = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'CHAT_ENCRYPTION_KEY',
];
const secrets = Object.fromEntries(names.map(name => [name, process.env[name]]));
if (config.name !== 'nooklie-preview' ||
    secrets.NEXT_PUBLIC_SUPABASE_URL !== 'https://vbjjxabtrdwhanektrfa.supabase.co' ||
    !secrets.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_') ||
    !secrets.SUPABASE_SECRET_KEY?.startsWith('sb_secret_') ||
    !/^[a-f0-9]{64}$/i.test(secrets.CHAT_ENCRYPTION_KEY ?? '')) {
  throw new Error('The isolated Nooklie Preview configuration is incomplete.');
}

// Export the already-built modules to a standalone Wrangler project.
const directory = mkdtempSync(join(tmpdir(), 'nooklie-worker-preview-'));
try {
  for (const part of ['bundle', 'assets']) {
    cpSync(join(output, part), join(directory, part), { recursive: true });
  }
  writeFileSync(join(directory, 'wrangler.json'), JSON.stringify(config));
  writeFileSync(join(directory, 'worker-secrets.json'), JSON.stringify(secrets), { mode: 0o600 });
  const args = ['--yes', '--package=wrangler@4.158.0', 'wrangler', 'deploy',
    '--config', 'wrangler.json', '--secrets-file', 'worker-secrets.json',
    '--no-autoconfig', '--keep-vars', ...process.argv.slice(2)];
  const child = spawnSync('npx', args, { cwd: directory, stdio: 'inherit' });
  if (child.error) throw child.error;
  process.exitCode = child.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
