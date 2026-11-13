'use client';

import AccountBadge from '@/components/AccountBadge';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { contentMediaUrl } from '@/lib/security/content-media';
import { storyFormats } from '@/lib/stories/metadata';

type Original = {
  id: string;
  title: string;
  cover_url: string | null;
  story_format?: keyof typeof storyFormats;
  author: { username: string; display_name: string | null; verified?: boolean; is_official?: boolean } | null;
};

export default function OriginalsShelf() {
  const [stories, setStories] = useState<Original[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/explore?kind=original&sort=debut', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Não foi possível carregar as estreias.');
        const data = await response.json();
        setStories(data.stories.slice(0, 6));
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  return (
    <section aria-label="Originais recentes" className="originals-shelf mb-10 rounded-3xl border border-pink-300/20 bg-gradient-to-br from-[#301727] via-[#21131e] to-[#140e16] p-5 text-white sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-pink-300">Obras da comunidade</p>
          <h2 className="mt-2 text-2xl font-black sm:text-3xl">Originais recentes</h2>
          <p className="mt-2 text-sm leading-6 text-white/70">Conheça livros, contos e outros universos que acabaram de estrear no Nooklie.</p>
        </div>
        <Link href="/explorar?kind=original&sort=debut" className="discovery-secondary">Explorar originais</Link>
      </div>
      {stories?.length ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {stories.map(story => (
            <Link key={story.id} href={`/historia/${story.id}`} className="group min-w-0 rounded-2xl focus-visible:outline-pink-300">
              <div className="originals-cover grid aspect-[3/4] place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#5a2a46] to-[#1a101d] text-pink-200">
                {story.cover_url ? <img src={contentMediaUrl(story.cover_url, 'cover')} alt="" loading="lazy" className="h-full w-full object-cover group-hover:opacity-85" /> : <BookOpen size={32} />}
              </div>
              <h3 className="mt-2 line-clamp-2 text-sm font-bold group-hover:text-pink-200">{story.title}</h3>
              <p className="mt-1 truncate text-xs text-white/60">{story.author?.display_name || story.author?.username}<AccountBadge account={story.author} /></p>
              {story.story_format && <p className="mt-1 text-xs text-pink-200">{storyFormats[story.story_format]}</p>}
            </Link>
          ))}
        </div>
      ) : (
        <p role="status" className="mt-5 rounded-2xl border border-dashed border-white/15 p-4 text-sm text-white/65">
          {failed ? 'Não foi possível carregar as estreias agora.' : stories ? 'As primeiras obras originais vão aparecer aqui.' : 'Carregando originais…'}
        </p>
      )}
    </section>
  );
}
