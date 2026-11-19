import { getD1PreviewDatabase } from '@/lib/database/preview';
import {contentMediaUrl} from '@/lib/security/content-media';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { discoveryDb, uuid } from '@/lib/discovery/server';
import { isPublicProfileVisible } from '@/lib/moderation/content-visibility';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const unavailable: Metadata = { title: 'História | Nooklie', robots: { index: false, follow: false } };
  if (!uuid.test(id)) return unavailable;
  try {
    const db = getD1PreviewDatabase('auth');
    let data: { title: string; description: string | null; cover_url: string | null };
    if (db) {
      const story = await db.prepare(`SELECT s.title,s.description,s.cover_url FROM released_stories s
        JOIN profiles p ON p.id=s.author_id JOIN auth_accounts a ON a.id=p.user_id
        WHERE s.id=? AND p.is_private=0 AND p.moderation_hidden_at IS NULL AND a.account_status='active'`)
        .bind(id).first<typeof data>();
      if (!story) return unavailable;
      data = story;
    } else {
      const story = await discoveryDb.from('released_stories').select('title,description,cover_url,author_id')
        .eq('id',id).is('moderation_hidden_at',null).maybeSingle();
      if (story.error) throw story.error;
      if (!story.data || !(await isPublicProfileVisible(discoveryDb,story.data.author_id,null))) return unavailable;
      data = story.data;
    }
    const title=`${data.title} | Nooklie`;
    const description=(data.description || 'Leia esta história no Nooklie.').replace(/<[^>]+>|[*#]/g,'').slice(0,180);
    const origin=process.env.NEXT_PUBLIC_SITE_URL || 'https://nooklie.vercel.app';
    const url=new URL('/historia/'+id,origin).href;
    return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, siteName:'Nooklie', type:'article', ...(data.cover_url ? {images:[new URL(contentMediaUrl(data.cover_url)!,url).href]} : {}) } };
  } catch { return unavailable; }
}

export default function StoryLayout({ children }: { children: ReactNode }) { return children; }
