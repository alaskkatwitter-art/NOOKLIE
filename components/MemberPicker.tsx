'use client';
import { useEffect, useId, useState } from 'react';
import { contentMediaUrl } from '@/lib/security/content-media';
import AccountBadge from './AccountBadge';
export type Person = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  verified?: boolean;
  is_official?: boolean;
};
export default function MemberPicker({
  value,
  onChange,
  threadId,
  max = 14,
  disabled = false,
}: {
  value: Person[];
  onChange: (people: Person[]) => void;
  threadId?: string;
  max?: number;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(''),
    [results, setResults] = useState<Person[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [index, setIndex] = useState(0),
    [focused, setFocused] = useState(false);
  const listId = useId();
  useEffect(() => {
    const term = query.trim().replace(/^@/, '');
    if (!term) return;
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(
          '/api/chat/people?q=' +
            encodeURIComponent(term) +
            (threadId ? '&thread=' + encodeURIComponent(threadId) : ''),
          { signal: abort.signal, cache: 'no-store' },
        );
        const data = await response.json();
        if (!response.ok)
          throw Error(data.error || 'Não foi possível buscar pessoas.');
        setResults(data.people || []);
        setIndex(0);
      } catch (cause) {
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Não foi possível buscar pessoas.',
          );
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, threadId]);
  const available = results.filter(
    (person) => !value.some((selected) => selected.id === person.id),
  );
  const show =
    focused && !!query.trim().replace(/^@/, '') && value.length < max;
  function choose(person: Person) {
    if (value.length >= max) return;
    onChange([...value, person]);
    setQuery('');
    setResults([]);
    setIndex(0);
  }
  return (
    <div className="space-y-3">
      <input
        type="hidden"
        name="people"
        value={value.map((person) => person.username).join(',')}
      />
      <div className="flex flex-wrap gap-2">
        {value.map((person) => (
          <button
            type="button"
            key={person.id}
            disabled={disabled}
            onClick={() =>
              onChange(value.filter((item) => item.id !== person.id))
            }
            className="rounded-full border border-pink-300/25 px-3 py-2 text-xs text-pink-100"
            aria-label={'Remover @' + person.username}
          >
            @{person.username} ×
          </button>
        ))}
      </div>
      <div className="relative">
        <input
          aria-label="Buscar participantes por username"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={show}
          aria-controls={listId}
          aria-activedescendant={
            show && available[index]
              ? listId + '-' + available[index].id
              : undefined
          }
          autoComplete="off"
          value={query}
          disabled={disabled || value.length >= max}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={(event) => {
            setQuery(event.target.value);
            setResults([]);
            setIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setIndex(Math.min(index + 1, available.length - 1));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setIndex(Math.max(0, index - 1));
            }
            if (event.key === 'Escape') setFocused(false);
            if (event.key === 'Enter') {
              event.preventDefault();
              if (show && available[index]) choose(available[index]);
            }
          }}
          placeholder="Digite @ e as primeiras letras"
          className="nook-input w-full"
          maxLength={31}
        />
        {show && (
          <div
            id={listId}
            role="listbox"
            aria-label="Pessoas encontradas"
            className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-pink-300/20 bg-[#211623] p-2 shadow-xl"
          >
            {loading ? (
              <p role="status" className="p-3 text-sm text-white/60">
                Buscando…
              </p>
            ) : available.length ? (
              available.map((person, i) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={index === i}
                  id={listId + '-' + person.id}
                  key={person.id}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(person)}
                  className={
                    'flex w-full items-center gap-3 rounded-lg p-3 text-left ' +
                    (index === i ? 'bg-pink-300/10' : 'hover:bg-white/5')
                  }
                >
                  {person.avatar_url ? (
                    <img
                      src={contentMediaUrl(person.avatar_url)}
                      alt=""
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-pink-300/15">
                      {person.username[0].toUpperCase()}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">
                      {person.display_name || person.username}
                      <AccountBadge account={person} />
                    </span>
                    <span className="text-xs text-white/50">
                      @{person.username}
                    </span>
                  </span>
                </button>
              ))
            ) : (
              <p role="status" className="p-3 text-sm text-white/60">
                {error || 'Nenhuma pessoa disponível com esse username.'}
              </p>
            )}
          </div>
        )}
      </div>
      <p className="text-xs text-white/45">
        {value.length}/{max} selecionados. Busque e toque no perfil para
        adicionar.
      </p>
    </div>
  );
}
