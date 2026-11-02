import Link from 'next/link';
import { BookOpen, Cloud } from 'lucide-react';
import type { DiscoveryStory } from '@/lib/discovery/types';

export default function DiscoveryShelf({ title, description, stories, empty, metric }: { title: string; description: string; stories: DiscoveryStory[]; empty: string; metric?: 'views' | 'reads' | 'week' }) {
  return <section className="discovery-section"><div className="mb-5"><h2 className="text-2xl font-bold tracking-tight">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-white/60">{description}</p></div>
    {stories.length ? <div className="discovery-shelf">{stories.map(story=><Link key={story.id} href={`/historia/${story.id}`} className="discovery-card group">
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-gradient-to-br from-[#663044] via-[#342038] to-[#15101a]">{story.cover_url ? <img src={story.cover_url} alt={`Capa de ${story.title}`} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-105"/> : <div className="flex h-full flex-col items-center justify-center gap-5 px-5 text-center"><Cloud size={48} className="fill-[#ffb5d5]/30 text-[#ffc8e2]"/><p className="font-bold text-[#ffe2ee]">{story.title}</p></div>}
        {story.rating && <span className="absolute left-2 top-2 rounded-lg bg-black/75 px-2 py-1 text-[11px] text-white">{story.rating === 'Livre' ? 'Livre' : `${story.rating}+`}</span>}
        {metric && <span className="absolute bottom-2 left-2 right-2 rounded-lg bg-black/80 px-2 py-2 text-xs text-white">{metric === 'week' ? `${story.week_reads} leituras · ${story.week_views} acessos` : `${story[metric]} ${metric === 'reads' ? 'leituras' : 'acessos'}`}</span>}
      </div><h3 className="mt-3 line-clamp-2 text-sm font-bold leading-6 group-hover:text-[#ffc5df]">{story.title}</h3><p className="mt-1 truncate text-xs text-white/55">{story.display_name || story.username}</p><p className="mt-2 truncate text-xs text-[#eab7d2]">{story.fandom || 'Veja os fandoms na obra'}</p>
      {(story.work_has_ai || story.cover_has_ai || story.has_content_warnings) && <p className="mt-2 text-[11px] leading-5 text-amber-100/80">{[story.work_has_ai && 'Obra com IA',story.cover_has_ai && 'Capa com IA',story.has_content_warnings && 'Contém avisos'].filter(Boolean).join(' · ')}</p>}
    </Link>)}</div> : <div className="flex items-center gap-3 rounded-2xl border border-dashed border-white/15 p-5 text-sm leading-6 text-white/55"><BookOpen size={24} className="shrink-0 text-[#d7a5c3]"/>{empty}</div>}
  </section>;
}
