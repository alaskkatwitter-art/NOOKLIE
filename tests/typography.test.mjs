import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../', import.meta.url);
const source = await readFile(new URL('lib/reader/preferences.ts', root), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { READER_FONTS, DEFAULT_READER_PREFERENCES, isReaderPreferences, readerStorageKey } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('reader preferences validate every choice and reject arbitrary CSS and foreign account fields', () => {
  for (const font of READER_FONTS) assert.ok(isReaderPreferences({ ...DEFAULT_READER_PREFERENCES, fontId: font.id }));
  assert.equal(READER_FONTS.length, 13);
  for (const patch of [{ fontId: 'url(evil)' }, { fontSize: 1 }, { lineHeight: 0 }, { margin: 500 }, { theme: 'invalid' }, { user_id: 'another-account' }, { fontSize: NaN }, { fontSize: Infinity }, { toString: 'extra' }]) {
    assert.equal(isReaderPreferences({ ...DEFAULT_READER_PREFERENCES, ...patch }), false);
  }
  assert.notEqual(readerStorageKey(null), readerStorageKey('owner'));
  assert.notEqual(readerStorageKey('reader-a'), readerStorageKey('reader-b'));
  assert.equal(DEFAULT_READER_PREFERENCES.fontSize * DEFAULT_READER_PREFERENCES.lineHeight, 32);
});

test('distributed chapter font binaries retain official provenance, checksums and complete OFL notices', async () => {
  const manifest = JSON.parse(await readFile(new URL('public/fonts/manifest.json', root), 'utf8'));
  assert.equal(manifest.length, 13);
  const expected = ['Lora','Merriweather','Literata','Newsreader','EB Garamond','Source Serif 4','Libre Baskerville','Nunito','DM Sans','Lexend','Atkinson Hyperlegible','Open Sans','Outfit'];
  assert.deepEqual(manifest.map((item) => item.name), expected);
  for (const item of manifest) {
    const license = await readFile(new URL('public' + item.license, root), 'utf8');
    assert.match(license, /SIL OPEN FONT LICENSE/i);
    assert.match(license, /Copyright/i);
    assert.equal(new URL(item.license_url).hostname, 'raw.githubusercontent.com');
    if (!['DM Sans','Outfit'].includes(item.name)) assert.ok(item.faces.length > 0);
    for (const face of item.faces) {
      const bytes = await readFile(new URL('public' + face.path, root));
      assert.equal(bytes.subarray(0,4).toString(), 'wOF2');
      assert.equal(createHash('sha256').update(bytes).digest('hex'), face.sha256);
      assert.equal(new URL(face.source_url).hostname, 'fonts.gstatic.com');
      assert.ok(['latin','latin-ext'].includes(face.subset));
    }
  }
  const readerCss = await readFile(new URL('lib/fonts/reader.css', root), 'utf8');
  assert.doesNotMatch(readerCss, /fonts\.googleapis\.com|fonts\.gstatic\.com|Nooklie Reader DM Sans/);
});

test('the original logo SVGs and legacy HTML wordmark font stay unchanged', async () => {
  const fixtures = JSON.parse(await readFile(new URL('tests/fixtures/logo-hashes.json', root), 'utf8'));
  for (const [path, expected] of Object.entries(fixtures)) {
    const text = await readFile(new URL(path, root), 'utf8');
    const svg = [...text.matchAll(/<svg\b[\s\S]*?<\/svg>/g)].map((match) => match[0]).join('\n');
    assert.equal(createHash('sha256').update(svg).digest('hex'), expected, path);
    assert.match(text, /font-nooklie-logo/);
  }
  const css = await readFile(new URL('app/globals.css', root), 'utf8');
  assert.match(css, /--font-nooklie-logo: ui-rounded, "Trebuchet MS", system-ui, sans-serif/);
});

test('the account preference migration validates data and denies browser roles in disposable PostgreSQL', async () => {
  const db = new PGlite();
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create table public.auth_accounts(id uuid primary key);');
    const migration = (await readdir(new URL('supabase/migrations/', root))).find((name) => name.endsWith('_reader_typography_preferences.sql'));
    await db.exec(await readFile(new URL('supabase/migrations/' + migration, root), 'utf8'));
    const checks = await db.query("select relrowsecurity as rls, has_table_privilege('anon','public.reader_preferences','SELECT,INSERT,UPDATE,DELETE') as anon_access, has_table_privilege('authenticated','public.reader_preferences','SELECT,INSERT,UPDATE,DELETE') as browser_access, has_table_privilege('service_role','public.reader_preferences','SELECT,INSERT,UPDATE') as server_access, has_table_privilege('service_role','public.reader_preferences','DELETE') as server_delete from pg_class where oid='public.reader_preferences'::regclass");
    assert.deepEqual(checks.rows[0], { rls:true, anon_access:false, browser_access:false, server_access:true, server_delete:false });
    await db.exec("insert into public.auth_accounts values ('90000000-0000-4000-8000-000000000001');");
    await db.query('insert into public.reader_preferences (user_id, preferences) values ($1,$2::jsonb)', ['90000000-0000-4000-8000-000000000001', JSON.stringify(DEFAULT_READER_PREFERENCES)]);
    const value = await db.query('select preferences from public.reader_preferences');
    assert.deepEqual(value.rows[0].preferences, DEFAULT_READER_PREFERENCES);
    await assert.rejects(db.query('update public.reader_preferences set preferences=$1::jsonb', [JSON.stringify({ ...DEFAULT_READER_PREFERENCES, fontSize:1 })]));
    await db.exec('set role anon');
    await assert.rejects(db.query('select * from public.reader_preferences'));
    await db.exec('reset role');
    await db.exec("delete from public.auth_accounts where id='90000000-0000-4000-8000-000000000001'");
    assert.equal((await db.query('select * from public.reader_preferences')).rows.length, 0);
  } finally { await db.close(); }
});
