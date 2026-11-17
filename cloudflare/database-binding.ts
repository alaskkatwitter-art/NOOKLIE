import { env } from 'cloudflare:workers';
import type { NooklieD1 } from '../lib/database/d1';

export function getD1Database(): NooklieD1 | undefined {
  return (env as { NOOKLIE_DB?: NooklieD1 }).NOOKLIE_DB;
}
