'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_READER_PREFERENCES, isReaderPreferences, readerStorageKey, type ReaderPreferences } from './preferences';

function storedPreferences(userId: string | null): { preferences: ReaderPreferences; pending: boolean } | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(readerStorageKey(userId)) || 'null');
    if (isReaderPreferences(value)) return { preferences: value, pending: false };
    if (value && typeof value === 'object' && 'preferences' in value && isReaderPreferences(value.preferences)) {
      return { preferences: value.preferences, pending: 'pending' in value && value.pending === true };
    }
    return null;
  } catch { return null; }
}

export function useReaderPreferences() {
  const [preferences, setPreferences] = useState<ReaderPreferences>(DEFAULT_READER_PREFERENCES);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Carregando preferências…');
  const userId = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const active = useRef(false);
  const revision = useRef(0);
  const pending = useRef<ReaderPreferences | null>(null);

  const persistAccount = useCallback((value: ReaderPreferences, version: number) => {
    if (!userId.current) return;
    const accountId = userId.current;
    queue.current = queue.current.catch(() => undefined).then(async () => {
      try {
        const response = await fetch('/api/reader/preferences', {
          method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Reader-Account': accountId },
          body: JSON.stringify(value), keepalive: true,
        });
        if (!response.ok) throw new Error('Account sync unavailable');
        if (revision.current === version) {
          try { localStorage.setItem(readerStorageKey(accountId), JSON.stringify({ preferences: value, pending: false })); } catch { /* Account save succeeded even if local storage is unavailable. */ }
        }
        if (active.current && revision.current === version) setStatus('Preferências salvas na sua conta.');
      } catch {
        if (active.current && revision.current === version) setStatus('Sincronização indisponível. As preferências ficam neste navegador quando o armazenamento está disponível.');
      }
    });
  }, []);

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    async function restore() {
      let value = storedPreferences(null)?.preferences || DEFAULT_READER_PREFERENCES;
      let message = 'Preferências deste navegador.';
      try {
        const response = await fetch('/api/reader/preferences', { cache: 'no-store', signal: controller.signal });
        if (response.ok) {
          const data = await response.json();
          userId.current = data.user_id;
          const local = storedPreferences(data.user_id);
          value = local?.pending ? local.preferences : isReaderPreferences(data.preferences) ? data.preferences : local?.preferences || value;
          message = data.preferences ? 'Preferências restauradas da sua conta.' : 'A próxima alteração será salva na sua conta.';
          if (local?.pending && !controller.signal.aborted) { message = 'Sincronizando alterações locais…'; persistAccount(value, revision.current); }
        } else if (response.status !== 401) {
          // A missing migration or server/network error must never look like a successful account save.
          message = 'Sincronização indisponível. Usando as preferências locais.';
          const data = await response.json().catch(() => null);
          if (typeof data?.user_id === 'string') { userId.current = data.user_id; value = storedPreferences(data.user_id)?.preferences || value; }
        }
      } catch { if (controller.signal.aborted) return; message = 'Sem conexão. Usando as preferências locais.'; }
      if (controller.signal.aborted) return;
      setPreferences(value); setStatus(message); setReady(true);
    }
    void restore();
    function flush() {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) { const value = pending.current; pending.current = null; persistAccount(value, revision.current); }
    }
    window.addEventListener('pagehide', flush);
    return () => { active.current = false; controller.abort(); flush(); window.removeEventListener('pagehide', flush); };
  }, [persistAccount]);

  const update = useCallback((value: ReaderPreferences) => {
    if (!ready || !isReaderPreferences(value)) return;
    revision.current += 1;
    setPreferences(value);
    let saved = false;
    try { localStorage.setItem(readerStorageKey(userId.current), JSON.stringify({ preferences: value, pending: Boolean(userId.current) })); saved = true; } catch { /* Reading remains usable with storage disabled. */ }
    setStatus(saved ? (userId.current ? 'Salvando na conta…' : 'Preferências salvas neste navegador.') : 'Preferência aplicada. O armazenamento deste navegador está indisponível.');
    if (timer.current) clearTimeout(timer.current);
    if (userId.current) {
      pending.current = value;
      timer.current = setTimeout(() => { pending.current = null; persistAccount(value, revision.current); }, 500);
    }
  }, [ready, persistAccount]);

  return { preferences, update, ready, status };
}
