import type { MetadataRoute } from 'next';
import { discoveryDb } from '@/lib/discovery/server';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin='https://toriland.vercel.app';
  const { data,error } = await discoveryDb.rpc('discovery_sitemap');
  if(error)throw error;
  return [
    { url:origin,changeFrequency:'weekly',priority:1 },
    { url:`${origin}/explorar`,changeFrequency:'daily',priority:0.9 },
    { url:`${origin}/eventos`,changeFrequency:'daily',priority:0.6 },
    ...(data || []).map((story:{id:string;updated_at:string})=>({url:`${origin}/historia/${story.id}`,lastModified:story.updated_at,changeFrequency:'weekly' as const,priority:0.8})),
  ];
}
