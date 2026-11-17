// Structural interfaces keep this isolated adapter usable in Node tests and Workers.
// No HTTP SQL endpoint, API token or browser-side database client is exposed.
export type D1Value = string | number | null;
export interface D1Statement {
  bind(...values: D1Value[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean; meta: { changes?: number } }>;
}
export interface NooklieD1 {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<Array<{ success: boolean; meta: { changes?: number } }>>;
}

export function getD1Database(): NooklieD1 | undefined {
  // Vite replaces this module with cloudflare/database-binding.ts in Workers.
  return undefined;
}
