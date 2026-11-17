'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, Pencil, Plus, Share2 } from 'lucide-react';
import EventEditor from './EventEditor';
import { eventContent, eventImageUrl, type EventImage, type LiteraryEvent } from '@/lib/discovery/events';

type OwnStory = { id: string; title: string };

function EventPicture({ eventId, image, className }: { eventId: string; image: EventImage; className: string }) {
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img src={eventImageUrl(eventId, image)} alt={image.alt} loading="lazy" decoding="async" className={className} />;
}

export default function EventsPage() {
  return <Suspense fallback={<main className="discovery-home p-5">Carregando eventos…</main>}><EventList /></Suspense>;
}

function EventList() {
  const sharedEvent = useSearchParams().get('evento') || '';
  const [sharedUrl, setSharedUrl] = useState('');
  const [events, setEvents] = useState<LiteraryEvent[]>([]);
  const [stories, setStories] = useState<OwnStory[]>([]);
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [retry, setRetry] = useState(0);
  const [editor, setEditor] = useState<'create' | LiteraryEvent | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const options = { cache: 'no-store' as const, signal: controller.signal };
    async function load() {
      try {
        const endpoint = sharedEvent ? '/api/events?evento=' + encodeURIComponent(sharedEvent) : '/api/events';
        const [res, own] = await Promise.all([fetch(endpoint, options), fetch('/api/profile/stories', options)]);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const mine = own.ok ? await own.json() : null;
        if (controller.signal.aborted) return;
        setEvents(data.events);
        setAdmin(data.can_manage);
        setStories(mine?.stories || []);
        setReady(true);
        setError('');
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Não foi possível carregar.');
      }
    }
    void load();
    return () => controller.abort();
  }, [retry, sharedEvent]);

  async function send(body: FormData | Record<string, unknown>, method = 'POST') {
    setBusy(true);
    try {
      const multipart = body instanceof FormData;
      const response = await fetch('/api/events', {
        method,
        ...(multipart ? {} : { headers: { 'Content-Type': 'application/json' } }),
        body: multipart ? body : JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || 'Não foi possível salvar.');
      setRetry(n => n + 1);
    } finally {
      setBusy(false);
    }
  }

  async function handleAction(body: Record<string, unknown>, method: string, success: string) {
    setMessage('');
    setError('');
    try {
      await send(body, method);
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    }
  }

  async function shareEvent(event: LiteraryEvent) {
    const url = new URL('/eventos', window.location.origin);
    url.searchParams.set('evento', event.id);
    setError('');
    setSharedUrl('');
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, url: url.href });
      } else {
        await navigator.clipboard.writeText(url.href);
        setMessage('Link do evento copiado.');
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setSharedUrl(url.href);
    }
  }

  return (
    <main className="discovery-home">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <CalendarDays size={30} className="text-[#ffc4df]" aria-hidden="true" />
            <h1 className="mt-3 text-3xl font-bold">Eventos literários</h1>
            {sharedEvent && <Link href="/eventos" className="mt-2 inline-block text-sm text-[#ffc4df] hover:underline">Ver todos os eventos</Link>}
          </div>
          {admin && !editor && !sharedEvent && (
            <button type="button" disabled={busy} onClick={() => setEditor('create')} className="discovery-secondary">
              <Plus size={17} aria-hidden="true" /> Criar evento
            </button>
          )}
        </div>
        {error && <p role="alert" className="my-5 text-rose-200">{error}</p>}
        {message && <p role="status" className="my-5 text-[#ffc4df]">{message}</p>}
        {sharedUrl && <label className="my-4 block text-sm">Link do evento
          <input readOnly value={sharedUrl} onFocus={event => event.currentTarget.select()}
            className="mt-1 block w-full rounded-lg border border-white/20 bg-transparent p-2" />
        </label>}
        {!ready && !error && <p className="py-8" role="status">Carregando eventos…</p>}
        {admin && editor && (
          <EventEditor
            key={editor === 'create' ? 'create' : editor.id}
            event={editor === 'create' ? undefined : editor}
            busy={busy}
            onCancel={() => setEditor(null)}
            onSave={async form => {
              await send(form, editor === 'create' ? 'POST' : 'PATCH');
              setMessage(editor === 'create' ? 'Evento publicado.' : 'Evento atualizado.');
              setEditor(null);
            }}
          />
        )}
        <div className="mt-8 space-y-6">
          {events.map(event => {
            const now = Date.now();
            const current = event.active && Date.parse(event.starts_at) <= now && Date.parse(event.ends_at) > now;
            const status = current ? 'Acontecendo agora' : !event.active ? 'Desativado' : Date.parse(event.starts_at) > now ? 'Em breve' : 'Encerrado';
            const content = eventContent(event);
            const [cover, ...gallery] = content.images;
            const sections = [
              { title: 'Como participar', text: content.instructions },
              { title: 'Regras', text: content.rules },
              ...content.topics,
            ];
            return (
              <article key={event.id} className="overflow-hidden rounded-2xl border border-[#ffc4df]/20 bg-[#241520]">
                {cover && <EventPicture eventId={event.id} image={cover} className="max-h-96 w-full bg-[#100b12] object-contain" />}
                <div className="space-y-5 p-4 sm:p-7">
                  <header>
                    <p className="text-sm text-[#ffc4df]">{status}</p>
                    <h2 className="mt-2 break-words text-2xl font-bold">{event.title}</h2>
                    <p className="mt-2 text-sm text-white/65">
                      Até {new Date(event.ends_at).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    </p>
                    {event.active && Date.parse(event.ends_at) > now && (
                      <button type="button" className="discovery-secondary mt-3" onClick={() => void shareEvent(event)}>
                        <Share2 size={16} aria-hidden="true" /> Compartilhar evento
                      </button>
                    )}
                  </header>
                  {(content.format || content.eligibility || content.entry_limit) && (
                    <dl className="grid gap-3 rounded-xl border border-white/10 p-4 text-sm sm:grid-cols-3">
                      {[
                        ['Formato', content.format], ['Obras aceitas', content.eligibility], ['Inscrições por autor', content.entry_limit],
                      ].map(([label, value]) => value && (
                        <div key={label}><dt className="text-xs text-white/60">{label}</dt><dd className="mt-1">{value}</dd></div>
                      ))}
                    </dl>
                  )}
                  {content.description && <p className="whitespace-pre-wrap break-words text-sm leading-7 text-white/85">{content.description}</p>}
                  {sections.map(({ title, text }, index) => text && (
                    <section key={index} className="border-t border-white/10 pt-4">
                      <h3 className="break-words text-lg font-semibold">{title}</h3>
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-white/85">{text}</p>
                    </section>
                  ))}
                  {gallery.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {gallery.map(image => <EventPicture key={image.id} eventId={event.id} image={image} className="max-h-96 w-full rounded-xl bg-[#100b12] object-contain" />)}
                    </div>
                  )}
                  {current && (stories.length ? (
                    <form className="flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row" onSubmit={e => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      void handleAction({ action: 'enter', event_id: event.id, story_id: form.get('story_id') }, 'POST', 'História inscrita.');
                    }}>
                      <label className="flex-1 text-sm">
                        Inscreva uma obra sua
                        <select required name="story_id" className="mt-2 w-full rounded-xl border border-white/20 bg-[#100b12] p-3">
                          <option value="">Escolha uma história</option>
                          {stories.map(story => <option key={story.id} value={story.id}>{story.title}</option>)}
                        </select>
                      </label>
                      <button disabled={busy} className="discovery-secondary self-end disabled:opacity-40">Inscrever história</button>
                    </form>
                  ) : (
                    <p className="text-sm text-white/70"><Link href="/escrever" className="text-[#ffc4df] underline">Crie e publique uma história</Link> para participar.</p>
                  ))}
                  {admin && (
                    <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
                      <button type="button" disabled={busy || Boolean(editor)} onClick={() => setEditor(event)} className="discovery-secondary disabled:opacity-40">
                        <Pencil size={15} aria-hidden="true" /> Editar evento
                      </button>
                      <button type="button" disabled={busy} onClick={() => void handleAction(
                        { id: event.id, active: !event.active }, 'PATCH', event.active ? 'Evento desativado.' : 'Evento ativado.',
                      )} className="discovery-secondary">
                        {event.active ? 'Desativar evento' : 'Ativar evento'}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        {ready && !events.length && !editor && (
          <p className="mt-2 rounded-xl border border-dashed border-white/20 p-6 text-white/70">{sharedEvent ? 'Este evento está indisponível.' : 'Nenhum evento publicado no momento.'}</p>
        )}
        {error && <button type="button" onClick={() => setRetry(n => n + 1)} className="discovery-secondary mt-5">Tentar novamente</button>}
      </div>
    </main>
  );
}
