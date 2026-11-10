import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../lib/profile/cover-palette.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { coverPalette } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

test('cover colors follow blue and red covers rather than a fixed brand pink', () => {
  for (const color of [[20, 90, 220], [210, 25, 60]]) {
    assert.deepEqual(coverPalette([...color, 255]), [color, color]);
  }
});

test('transparent pixels, black borders and white highlights do not dominate the gradient', () => {
  const pixels = [0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 255, 0,
    30, 70, 200, 255, 30, 70, 200, 255, 200, 40, 70, 255];
  assert.deepEqual(coverPalette(pixels), [[30, 70, 200], [200, 40, 70]]);
  assert.equal(coverPalette(pixels.slice(0, 12)), null);
});
