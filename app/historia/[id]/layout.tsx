import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { discoveryDb, uuid } from '@/lib/discovery/server';
import { isPublicProfileVisible } from '@/lib/moderation/content-visibility';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const unavailable: Metadata = { title: 'História | Nooklie', robots: { index: false, follow: false } };
  if (!uuid.test(id)) return unavailable;
  try {
    const [story, chapter] = await Promise.all([
      discoveryDb.from('stories').select('title,description,cover_url,author_id').eq('id',id).is('moderation_hidden_at',null).maybeSingle(),
      discoveryDb.from('chapters').select('id').eq('story_id',id).eq('published',true).limit(1),
    ]);
    if (story.error || chapter.error) throw story.error || chapter.error;
    if (!story.data || !chapter.data?.length || !(await isPublicProfileVisible(discoveryDb,story.data.author_id))) return unavailable;
    const title=`${story.data.title} | Nooklie`;
    const description=(story.data.description || 'Leia esta história no Nooklie.').replace(/<[^>]+>|[*#]/g,'').slice(0,180);
    const url=`https://toriland.vercel.app/historia/${id}`;
    return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, siteName:'Nooklie', type:'article', ...(story.data.cover_url ? {images:[story.data.cover_url]} : {}) } };
  } catch { return unavailable; }
}

export default function StoryLayout({ children }: { children: ReactNode }) { return children; }
