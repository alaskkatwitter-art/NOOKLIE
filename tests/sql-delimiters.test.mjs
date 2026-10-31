import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

const sqlDirectories = [
  new URL('../supabase/migrations/', import.meta.url),
  new URL('../supabase/verification/', import.meta.url),
];

test('migration and verification SQL has balanced dollar-quote delimiters', async () => {
  for (const directory of sqlDirectories) {
    for (const filename of await readdir(directory)) {
      if (!filename.endsWith('.sql')) continue;
      const source = await readFile(join(directory.pathname, filename), 'utf8');
      const counts = new Map();
      for (const [delimiter] of source.matchAll(/\\$([A-Za-z_][A-Za-z0-9_]*)?\\$/g)) {
        counts.set(delimiter, (counts.get(delimiter) || 0) + 1);
      }
      for (const [delimiter, count] of counts) {
        assert.equal(count % 2, 0, `${filename} has an unbalanced ${delimiter} delimiter`);
      }
    }
  }
});
