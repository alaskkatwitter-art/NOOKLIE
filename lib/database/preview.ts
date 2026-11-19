import { getD1Database } from '@/lib/database/d1';
import type { NooklieD1 } from './d1';

// Server-only opt-in. A missing binding fails closed in either environment.
export function getD1PreviewDatabase(feature:'auth'|'news'|'wiki'|'themes'):NooklieD1|undefined{
 const features=(process.env.NOOKLIE_D1_PREVIEW_FEATURES??'').split(',');
 if(!features.includes(feature))return undefined;
 const production=process.env.NOOKLIE_CLOUDFLARE_PRODUCTION==='1';
 const enabled=production
   ? process.env.NOOKLIE_D1_PRODUCTION==='1' && process.env.NOOKLIE_D1_PREVIEW!=='1'
   : process.env.NOOKLIE_D1_PREVIEW==='1' && process.env.NOOKLIE_D1_PRODUCTION!=='1';
 if(!enabled)throw Error('D1 feature requires isolated preview or an explicit production binding');
 const db=getD1Database();if(!db)throw Error('D1 binding missing');return db;
}
