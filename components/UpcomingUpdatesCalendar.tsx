'use client';

import { CalendarDays, ChevronLeft, ChevronRight, Clock3, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import AccountBadge from '@/components/AccountBadge';
import { contentMediaUrl } from '@/lib/security/content-media';

export type UpcomingUpdate = {
  id: string;
  story_id: string;
  chapter_number: number;
  chapter_title: string;
  story_title: string;
  story_cover_url: string | null;
  scheduled_for: string;
  author: {
    id: string;
    username: string;
    display_name: string | null;
    verified?: boolean;
    is_official?: boolean;
  };
};

export type CalendarStatus = 'loading' | 'ready' | 'signed-out' | 'error';
type Props = {
  updates: UpcomingUpdate[];
  status: CalendarStatus;
  onRetry: () => void;
  onClose?: () => void;
};

const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const fullDate = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function UpcomingUpdatesCalendar({ updates, status, onRetry, onClose }: Props) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const dayButtons = useRef(new Map<number, HTMLButtonElement>());
  const today = new Date();
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const todayInMonth = today.getFullYear() === year && today.getMonth() === monthIndex;
  const focusDay = selectedDay ?? (todayInMonth ? today.getDate() : 1);
  const { monthly, byDay } = useMemo(() => {
    const monthly = updates
      .map(update => ({ update, date: new Date(update.scheduled_for) }))
      .filter(({ date }) => date.getFullYear() === year && date.getMonth() === monthIndex)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
    const byDay = new Map<number, typeof monthly>();
    for (const entry of monthly) {
      const day = entry.date.getDate();
      const group = byDay.get(day) ?? [];
      group.push(entry);
      byDay.set(day, group);
    }
    return { monthly, byDay };
  }, [updates, year, monthIndex]);
  const visible = selectedDay === null ? monthly : byDay.get(selectedDay) ?? [];

  function moveMonth(offset: number) {
    setMonth(previous => new Date(previous.getFullYear(), previous.getMonth() + offset, 1));
    setSelectedDay(null);
  }

  function handleDayKey(event: KeyboardEvent, day: number) {
    const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const offset = offsets[event.key];
    if (offset === undefined && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const next = event.key === 'Home' ? 1 : event.key === 'End' ? days : Math.max(1, Math.min(days, day + offset));
    setSelectedDay(next);
    dayButtons.current.get(next)?.focus();
  }

  return (
    <section className="feed-calendar">
      <header className="flex items-start justify-between gap-2 border-b border-white/10 px-4 py-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-pink-100">
            <CalendarDays size={17} aria-hidden="true" /> Calendário de atualizações
          </h2>
          <p className="mt-1 text-xs leading-5 text-white/70">Capítulos programados dos autores que você segue.</p>
        </div>
        {onClose && <button type="button" aria-label="Fechar calendário" className="feed-calendar-control shrink-0" onClick={onClose}><X size={19} aria-hidden="true" /></button>}
      </header>
      <div className="px-3 py-4 sm:px-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <button type="button" aria-label="Mês anterior" className="feed-calendar-control" onClick={() => moveMonth(-1)}><ChevronLeft size={18} aria-hidden="true" /></button>
          <p className="text-center text-sm font-bold capitalize" aria-live="polite">{monthFormatter.format(month)}</p>
          <button type="button" aria-label="Próximo mês" className="feed-calendar-control" onClick={() => moveMonth(1)}><ChevronRight size={18} aria-hidden="true" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center" aria-hidden="true">
          {weekdays.map(day => <span key={day} className="py-1 text-[10px] text-white/70">{day}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-1" role="group" aria-label="Dias do mês">
          {Array.from({ length: month.getDay() }, (_, index) => <span key={`empty-${index}`} aria-hidden="true" />)}
          {Array.from({ length: days }, (_, index) => {
            const day = index + 1;
            const count = byDay.get(day)?.length ?? 0;
            const current = todayInMonth && day === today.getDate();
            const label = fullDate.format(new Date(year, monthIndex, day));
            return (
              <button
                key={day}
                ref={node => { if (node) dayButtons.current.set(day, node); else dayButtons.current.delete(day); }}
                type="button"
                aria-label={count ? `${label}, ${count} ${count === 1 ? 'capítulo programado' : 'capítulos programados'}` : label}
                aria-pressed={selectedDay === day}
                aria-current={current ? 'date' : undefined}
                tabIndex={focusDay === day ? 0 : -1}
                onClick={() => setSelectedDay(day)}
                onKeyDown={event => handleDayKey(event, day)}
                className="feed-calendar-day"
              >
                {day}
                {count > 0 && <span aria-hidden="true" className="feed-calendar-dot" />}
              </button>
            );
          })}
        </div>
      </div>
      <div className="border-t border-white/10 px-3 py-4 sm:px-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-1">
          <h3 className="text-sm font-bold text-white" aria-live="polite">
            {selectedDay === null ? 'Programação do mês' : fullDate.format(new Date(year, monthIndex, selectedDay))}
          </h3>
          {selectedDay !== null && <button type="button" className="min-h-11 rounded-lg px-2 text-xs font-semibold text-pink-200 hover:bg-white/10" onClick={() => setSelectedDay(null)}>Ver o mês</button>}
        </div>
        {status === 'loading' && <p role="status" className="text-xs text-white/70">Carregando a programação…</p>}
        {status === 'signed-out' && <p className="text-xs leading-5 text-white/75"><Link href="/login" className="font-semibold text-pink-200 underline" onClick={onClose}>Entre na sua conta</Link> para ver a programação de quem você segue.</p>}
        {status === 'error' && <div role="status" className="text-xs text-white/75">A programação está indisponível. <button type="button" onClick={onRetry} className="min-h-11 rounded-lg px-2 font-semibold text-pink-200 underline">Tentar novamente</button></div>}
        {status === 'ready' && visible.length === 0 && (
          <p role="status" className="text-xs leading-5 text-white/70">
            {selectedDay === null ? 'Nenhum capítulo programado para este mês.' : 'Nenhum capítulo programado para este dia.'}
          </p>
        )}
        {status === 'ready' && visible.length > 0 && (
          <ul className="space-y-2">
            {visible.map(({ update, date }) => (
              <li key={update.id}>
                <Link href={`/historia/${update.story_id}`} onClick={onClose} className="feed-calendar-story group flex items-start gap-2.5 rounded-xl border p-2.5">
                  {update.story_cover_url && <img src={contentMediaUrl(update.story_cover_url, 'cover')} alt="" loading="lazy" decoding="async" className="aspect-[2/3] w-9 shrink-0 rounded object-cover sm:w-10" />}
                  <div className="min-w-0 flex-1">
                    <p className="mb-1 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-pink-200">
                      <Clock3 size={12} aria-hidden="true" /> Programado
                      <time dateTime={update.scheduled_for}>{selectedDay === null && `${shortDate.format(date)} · `}{time.format(date)}</time>
                    </p>
                    <p className="break-words text-sm font-bold text-white group-hover:text-pink-100">{update.story_title}</p>
                    <p className="break-words text-xs leading-5 text-white/75">Cap. {update.chapter_number}{update.chapter_title && ` · ${update.chapter_title}`}</p>
                    <p className="break-words text-xs leading-5 text-white/70">@{update.author.username}<AccountBadge account={update.author} /></p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
