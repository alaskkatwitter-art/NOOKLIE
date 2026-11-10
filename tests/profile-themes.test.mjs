import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';

const source = await readFile(new URL('../lib/profile/themes.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { parseProfileTheme, parseProfileThemeCollection, profileThemePresets } =
  await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('profile themes accept all presets and reject unreadable palettes and arbitrary CSS', () => {
  for (const preset of profileThemePresets) assert.deepEqual(parseProfileTheme(preset), preset);
  const original = profileThemePresets[0];
  for (const theme of [
    { ...original, font: 'url(https://example.com/font)' },
    { ...original, accent: '#fff;background:red' },
    { ...original, text: original.background },
    { ...original, css: 'body{display:none}' },
  ]) assert.equal(parseProfileTheme(theme), null);
  assert.equal(parseProfileThemeCollection({
    drafts: [original, { ...original, name: original.name.toLowerCase() }], active: null, revision: 0,
  }), null);
  assert.deepEqual(parseProfileThemeCollection({
    drafts: [original], active: profileThemePresets[1], revision: 2,
  }), { drafts: [original], active: profileThemePresets[1], revision: 2 });
});

test('theme collection migration isolates drafts from browser roles and validates storage shape', async () => {
  const db = new PGlite();
  const owner = '90000000-0000-4000-8000-000000000001';
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create table public.auth_accounts(id uuid primary key);');
    const folder = new URL('../supabase/migrations/', import.meta.url);
    const file = (await readdir(folder)).find(name => name.endsWith('_public_profile_themes.sql'));
    assert.ok(file);
    const migration = await readFile(new URL(file, folder), 'utf8');
    await db.exec(migration);
    await db.query('insert into public.auth_accounts values ($1)', [owner]);
    await db.query('insert into public.profile_themes (user_id, revision) values ($1, 1)', [owner]);
    await assert.rejects(db.exec("update public.profile_themes set drafts = '{}'"), /check constraint/);
    await assert.rejects(db.exec("update public.profile_themes set active = '[]'"), /check constraint/);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      await assert.rejects(db.exec('select * from public.profile_themes'), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    await db.query('update public.profile_themes set drafts=$1::jsonb, active=$2::jsonb, revision=2 where user_id=$3 and revision=1',
      [JSON.stringify([profileThemePresets[0]]), JSON.stringify(profileThemePresets[0]), owner]);
    const stored = await db.query('select revision, active from public.profile_themes');
    assert.deepEqual(stored.rows, [{ revision: 2, active: profileThemePresets[0] }]);
  } finally {
    await db.close();
  }
});
