'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronRight } from 'lucide-react';

type Highlight = { id: string; title: string };

export default function LiteraryEventHighlight() {
  const [event, setEvent] = useState<Highlight | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/events?destaque=1', { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted) setEvent(data?.event ?? null); })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return <Link href={event ? '/eventos?evento=' + event.id : '/eventos'}
    className="mb-5 flex items-center gap-3 rounded-lg border border-[#f575ad]/30 bg-[#f575ad]/10 px-4 py-3 text-sm hover:border-[#f575ad]">
    <CalendarDays size={20} className="shrink-0" aria-hidden="true" />
    <span className="min-w-0 grow">
      <span className="block text-xs">Eventos literários</span>
      <strong className="block break-words">{event?.title ?? 'Ver eventos'}</strong>
    </span>
    <ChevronRight size={18} className="shrink-0" aria-hidden="true" />
  </Link>;
}
