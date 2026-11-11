'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import UpcomingUpdatesCalendar, { type CalendarStatus, type UpcomingUpdate } from '@/components/UpcomingUpdatesCalendar';

export default function CalendarioPage() {
  const [updates, setUpdates] = useState<UpcomingUpdate[]>([]);
  const [status, setStatus] = useState<CalendarStatus>('loading');
  const pending = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    setStatus('loading');
    try {
      const response = await fetch('/api/upcoming-updates', { cache: 'no-store', signal: request.signal });
      if (request.signal.aborted) return;
      if (response.status === 401) {
        setStatus('signed-out');
        return;
      }
      if (!response.ok) throw new Error('Calendário indisponível.');
      const data = await response.json();
      if (request.signal.aborted) return;
      setUpdates(Array.isArray(data.updates) ? data.updates : []);
      setStatus('ready');
    } catch {
      if (!request.signal.aborted) setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
    return () => pending.current?.abort();
  }, [load]);

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-6 sm:px-6">
      <h1 className="sr-only">Calendário de atualizações</h1>
      <UpcomingUpdatesCalendar updates={updates} status={status} onRetry={load} />
    </main>
  );
}
