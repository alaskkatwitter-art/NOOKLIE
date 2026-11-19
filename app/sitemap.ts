import { getD1PreviewDatabase } from '@/lib/database/preview';
import type { MetadataRoute } from 'next';
import { discoveryDb } from '@/lib/discovery/server';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin=process.env.NEXT_PUBLIC_SITE_URL || 'https://nooklie.vercel.app';
  const db = getD1PreviewDatabase('auth');
  let data: { id: string; updated_at: string }[];
  if (db) {
    const result = await db.prepare(`SELECT s.id,s.updated_at FROM released_stories s
      JOIN profiles p ON p.id=s.author_id JOIN auth_accounts a ON a.id=p.user_id
      WHERE p.is_private=0 AND p.moderation_hidden_at IS NULL AND a.account_status='active'
      ORDER BY s.id`).all<{ id: string; updated_at: string }>();
    if (!result.success) throw new Error('Não foi possível carregar o sitemap.');
    data = result.results;
  } else {
    const result = await discoveryDb.rpc('discovery_sitemap');
    if (result.error) throw result.error;
    data = result.data || [];
  }
  return [
    { url:origin,changeFrequency:'weekly',priority:1 },
    { url:`${origin}/explorar`,changeFrequency:'daily',priority:0.9 },
    { url:`${origin}/eventos`,changeFrequency:'daily',priority:0.6 },
    ...(data || []).map((story:{id:string;updated_at:string})=>({url:`${origin}/historia/${story.id}`,lastModified:story.updated_at,changeFrequency:'weekly' as const,priority:0.8})),
  ];
}
