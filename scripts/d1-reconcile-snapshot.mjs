import { importTableOrder, normalizeImportRow, orderImportRows } from './d1-import-plan.mjs';
import inventory from '../d1/source-inventory.json' with { type: 'json' };

function identifier(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw Error('Invalid schema identifier');
  return '"' + name + '"';
}

function indexRows(rows, keys, table) {
  const indexed = new Map();
  for (const row of rows) {
    const values = keys.map(key => row[key]);
    if (values.some(value => value === undefined || value === null)) throw Error('Invalid primary key: ' + table);
    const key = JSON.stringify(values);
    if (indexed.has(key)) throw Error('Duplicate primary key: ' + table);
    indexed.set(key, row);
  }
  return indexed;
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortJson(value[key])]));
  }
  return value;
}

function equalField(a, b, type) {
  if (a === b) return true;
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (['jsonb', 'json', 'ARRAY'].includes(type)) {
    return JSON.stringify(sortJson(JSON.parse(a))) === JSON.stringify(sortJson(JSON.parse(b)));
  }
  if (type === 'timestamp with time zone') {
    const date = Date.parse(a);
    return Number.isFinite(date) && date === Date.parse(b);
  }
  return false;
}

// The statement deliberately aborts its transaction when the predicate is false.
// SQLite evaluates only the selected CASE branch.
const assertSql = (condition, params = []) => ({
  sql: `SELECT CASE WHEN ${condition} THEN 1 ELSE abs(-9223372036854775808) END AS verified`, params,
});

function verifyRows(table, rows, names, keys) {
  const name = identifier(table);
  const statements = [assertSql(`(SELECT count(*) FROM ${name})=?`, [rows.length])];
  const field = col => `json_extract(expected.value,'$.${col}')`;
  const match = keys.map(col => `actual.${identifier(col)} IS ${field(col)}`).join(' AND ');
  const equal = names.map(col => `actual.${identifier(col)} IS ${field(col)}`).join(' AND ');
  let chunk = [];
  let bytes = 2;
  function flush() {
    if (!chunk.length) return;
    statements.push(assertSql(`NOT EXISTS(SELECT 1 FROM json_each(?) expected WHERE NOT EXISTS(
      SELECT 1 FROM ${name} actual WHERE ${match} AND ${equal}))`, [JSON.stringify(chunk)]));
    chunk = [];
    bytes = 2;
  }
  for (const row of rows) {
    const size = Buffer.byteLength(JSON.stringify(row)) + 1;
    if (chunk.length && bytes + size > 120_000) flush();
    chunk.push(row);
    bytes += size;
  }
  flush();
  return statements;
}

// readSource must expose one consistent PostgreSQL snapshot, or remain frozen
// for the entire read. query must execute the array as one atomic D1 batch.
export async function reconcileD1Snapshot({ schema, sourceColumns, readSource, readTarget, query }) {
  const tables = new Map(schema.tables.map(table => [table.name, table]));
  if (tables.size !== schema.tables.length || tables.size !== inventory.tables.length ||
      inventory.tables.some(name => !tables.has(name))) throw Error('Incomplete Nooklie table inventory');
  const order = importTableOrder(schema.tables);
  const before = [], after = [], writes = [], pins = [];
  const deletes = new Map();
  const report = Object.create(null);

  for (const name of order) {
    const table = tables.get(name);
    const quoted = identifier(name);
    const names = table.columns.map(c => c.name);
    const keys = table.columns.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name);
    if (!keys.length) throw Error('No primary key: ' + name);
    const types = new Map(sourceColumns.filter(c => c.table_name === name).map(c => [c.column_name, c.data_type]));
    const [rawSource, rawTarget] = await Promise.all([readSource(name, keys), readTarget(name, keys)]);
    const target = indexRows(rawTarget, keys, name);
    const source = indexRows(rawSource.map(row => normalizeImportRow(name, row, sourceColumns, table.columns)), keys, name);
    const changes = { inserted: 0, updated: 0, deleted: 0, verified: source.size };
    const keyOf = row => JSON.stringify(keys.map(col => row[col]));
    const keyFilter = keys.map(col => `${identifier(col)} IS ?`).join(' AND ');
    // Preserve the target representation of equivalent JSON and timestamps.
    for (const [key, row] of source) {
      const old = target.get(key);
      if (old) for (const col of names) {
        if (equalField(row[col], old[col], types.get(col))) row[col] = old[col];
      }
    }
    const expected = [...source.values()];
    before.push(...verifyRows(name, rawTarget, names, keys));
    after.push(...verifyRows(name, expected, names, keys));
    const remove = orderImportRows(table, [...target.values()]).filter(row => !source.has(keyOf(row))).reverse();
    changes.deleted = remove.length;
    deletes.set(name, remove.map(row => ({
      sql: `DELETE FROM ${quoted} WHERE ${keyFilter}`, params: keys.map(col => row[col]),
    })));

    for (const row of orderImportRows(table, expected)) {
      const previous = target.get(keyOf(row));
      const changed = names.filter(col => !keys.includes(col) && (!previous || row[col] !== previous[col]));
      if (previous && !changed.length) continue;
      if (previous) changes.updated++;
      else changes.inserted++;
      const values = { ...row };
      if (name === 'profiles' && (!previous || changed.includes('pinned_story_id'))) {
        pins.push({ sql: 'UPDATE profiles SET pinned_story_id=? WHERE id=?', params: [row.pinned_story_id, row.id] });
        values.pinned_story_id = null;
      }
      if (previous) {
        writes.push({ sql: `UPDATE ${quoted} SET ${changed.map(col => identifier(col) + '=?').join(',')} WHERE ${keyFilter}`,
          params: [...changed.map(col => values[col]), ...keys.map(col => row[col])] });
      } else {
        writes.push({ sql: `INSERT INTO ${quoted} (${names.map(identifier).join(',')}) VALUES (${names.map(() => '?').join(',')})`,
          params: names.map(col => values[col]) });
      }
    }
    report[name] = changes;
  }

  const rowDeletes = [...order].reverse().flatMap(name => deletes.get(name));
  const sideEffects = schema.triggers.filter(trigger =>
    tables.has(trigger.tbl_name) && /\bAFTER\s+(INSERT|UPDATE)\b/i.test(trigger.sql));
  const changes = [...writes, ...rowDeletes, ...pins];
  const mutations = changes.length ? [
    { sql: 'PRAGMA defer_foreign_keys=ON' },
    ...sideEffects.map(trigger => ({ sql: 'DROP TRIGGER ' + identifier(trigger.name) })),
    ...changes,
    ...sideEffects.map(trigger => ({ sql: trigger.sql })),
  ] : [];
  const result = await query({ batch: [...before, ...mutations, ...after,
    assertSql('NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check)'),
  ] });
  if (!Array.isArray(result) || result.length !== before.length + mutations.length + after.length + 1 ||
      result.some(statement => statement.success === false)) throw Error('D1 atomic batch failed');
  return report;
}
