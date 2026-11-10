'use client';

import AccountBadge from '@/components/AccountBadge';
import { contentMediaUrl } from '@/lib/security/content-media';
import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExploreStory } from './ExplorarContent';

export default function FeaturedStories({ stories }: { stories: ExploreStory[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const count = stories.length;
  const story = stories[active] ?? stories[0];

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.intersectionRatio >= 0.35), {
      threshold: 0.35,
    });
    if (track.current) observer.observe(track.current);
    return () => {
      media.removeEventListener('change', sync);
      observer.disconnect();
    };
  }, []);

  const move = useCallback((index: number) => {
    const viewport = track.current;
    const next = (index + count) % count;
    const cover = viewport?.children[next];
    if (!viewport || !cover) return;
    const outer = viewport.getBoundingClientRect();
    const inner = cover.getBoundingClientRect();
    viewport.scrollTo({
      left: viewport.scrollLeft + inner.left - outer.left + (inner.width - outer.width) / 2,
      behavior: reducedMotion || Math.abs(next - active) > 1 ? 'instant' : 'smooth',
    });
  }, [active, count, reducedMotion]);

  useEffect(() => {
    if (count < 2 || paused || hovered || focused || reducedMotion || !visible) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) move(active + 1);
    }, 5500);
    return () => window.clearInterval(timer);
  }, [active, count, focused, hovered, move, paused, reducedMotion, visible]);

  function syncActive() {
    const viewport = track.current;
    if (!viewport) return;
    const center = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
    let closest = 0;
    let distance = Infinity;
    Array.from(viewport.children).forEach((cover, index) => {
      const rect = cover.getBoundingClientRect();
      const offset = Math.abs(rect.left + rect.width / 2 - center);
      if (offset < distance) {
        closest = index;
        distance = offset;
      }
    });
    setActive(closest);
  }

  function navigate(index: number) {
    setPaused(true);
    move(index);
  }

  if (!story) return null;
  const genre = story.tags?.find(tag => tag.category_slug === 'genre')?.name;

  return (
    <section
      aria-labelledby="explore-featured-title"
      aria-roledescription="carrossel"
      className="mb-10 overflow-hidden rounded-[2rem] border border-pink-200/15 bg-[radial-gradient(ellipse_at_top,#45253c,#1a121d_70%)] [container-type:inline-size]"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-7 sm:pt-6">
        <h2 id="explore-featured-title" className="text-xl font-bold">Em destaque</h2>
        {count > 1 && (
          <div className="flex items-center gap-1">
            {!reducedMotion && (
              <button type="button" onClick={() => setPaused(value => !value)} className="min-h-11 rounded-full px-3 text-sm font-semibold text-pink-100 hover:bg-white/10 focus-visible:outline-2">
                {paused ? 'Retomar' : 'Pausar'}
              </button>
            )}
            <button type="button" aria-label="História anterior" onClick={() => navigate(active - 1)} className="grid size-11 place-items-center rounded-full border border-white/15 hover:bg-white/10 focus-visible:outline-2">
              <ChevronLeft aria-hidden="true" />
            </button>
            <button type="button" aria-label="Próxima história" onClick={() => navigate(active + 1)} className="grid size-11 place-items-center rounded-full border border-white/15 hover:bg-white/10 focus-visible:outline-2">
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <div
        ref={track}
        className="flex snap-x snap-mandatory items-center gap-3 overflow-x-auto px-[max(27%,calc(50%-5.5rem))] py-5 [scrollbar-width:none] sm:gap-5 sm:px-[max(27%,calc(50%-7.5rem))]"
        onScroll={syncActive}
        onPointerDown={() => setPaused(true)}
      >
        {stories.map((item, index) => (
          <button
            key={item.id}
            type="button"
            tabIndex={index === active ? 0 : -1}
            aria-label={item.title}
            aria-current={index === active ? 'true' : undefined}
            onClick={() => navigate(index)}
            className="aspect-[2/3] w-[min(46cqw,11rem)] shrink-0 snap-center overflow-hidden rounded-2xl border border-white/20 bg-[#301c30] opacity-75 shadow-xl transition motion-safe:scale-90 aria-[current=true]:opacity-100 motion-safe:aria-[current=true]:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-200 sm:w-[min(46cqw,15rem)]"
          >
            {item.cover_url ? (
              <img src={contentMediaUrl(item.cover_url, 'cover')} alt="" loading={index < 2 ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full place-items-center p-4 text-pink-200"><BookOpen aria-hidden="true" /></span>
            )}
          </button>
        ))}
      </div>
      <div aria-live={paused || focused || reducedMotion ? 'polite' : 'off'} className="mx-auto max-w-xl px-5 pb-6 text-center">
        <p className="text-xs font-semibold text-pink-200">
          {genre && <span>{genre} · </span>}
          {story.rating === 'Livre' ? 'Livre' : story.rating ? `${story.rating} anos` : 'Classificação não informada'}
        </p>
        <h3 className="mt-1 break-words text-xl font-bold sm:text-2xl">{story.title}</h3>
        {story.author && (
          <p className="mt-1 text-sm text-white/80">
            por {story.author.display_name || story.author.username}<AccountBadge account={story.author} />
          </p>
        )}
        {story.description && <p className="mt-3 line-clamp-3 text-sm leading-6 text-white/75">{story.description}</p>}
        <Link href={`/historia/${story.id}`} className="mt-4 inline-flex min-h-11 items-center rounded-full bg-pink-200 px-5 text-sm font-bold text-[#271723] hover:bg-pink-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pink-200">
          Ver história
        </Link>
      </div>
    </section>
  );
}
