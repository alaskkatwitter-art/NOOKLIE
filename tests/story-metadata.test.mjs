import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';

const source = await readFile(new URL('../lib/stories/metadata.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { parseStoryMetadata } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));

test('publication declarations distinguish false, absent and invalid fields', () => {
  assert.deepEqual(parseStoryMetadata(new FormData()), {});
  const form = new FormData();
  form.set('work_has_ai', 'true'); form.set('cover_has_ai', 'false');
  form.set('has_content_warnings', 'true'); form.set('content_warnings', '  Luto  ');
  form.set('accepts_translation', 'false'); form.set('fandom', '  Universo original  ');
  assert.deepEqual(parseStoryMetadata(form), { fandom: 'Universo original', content_warnings: 'Luto', work_has_ai: true, cover_has_ai: false, has_content_warnings: true, accepts_translation: false });
  form.set('work_has_ai', 'yes'); assert.throws(() => parseStoryMetadata(form));
  form.set('work_has_ai', 'false'); form.set('fandom', 'x'.repeat(201)); assert.throws(() => parseStoryMetadata(form));
  form.set('fandom', 'Original'); form.set('content_warnings', 'x'.repeat(2001)); assert.throws(() => parseStoryMetadata(form));
});

test('publication migration preserves old works and persists independent declarations', async () => {
  const db = new PGlite();
  try {
    await db.exec("create table public.stories (id int primary key, title text); insert into public.stories values (1, 'Obra existente');");
    const migration = await readFile(new URL('../supabase/migrations/20261102182421_story_publication_metadata.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const before = (await db.query('select * from stories')).rows[0];
    assert.equal(before.title, 'Obra existente'); assert.equal(before.accepts_translation, false); assert.equal(before.work_has_ai, false);
    await db.exec("update stories set fandom='Original', work_has_ai=true, cover_has_ai=false, has_content_warnings=true, content_warnings='Luto', accepts_translation=true where id=1;");
    const saved = (await db.query('select * from stories')).rows[0];
    assert.equal(saved.work_has_ai, true); assert.equal(saved.cover_has_ai, false); assert.equal(saved.content_warnings, 'Luto'); assert.equal(saved.accepts_translation, true);
    await assert.rejects(db.query('update stories set fandom=$1', ['x'.repeat(201)]));
  } finally { await db.close(); }
});
