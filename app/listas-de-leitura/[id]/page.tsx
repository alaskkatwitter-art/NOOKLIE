'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react';
import ReadingListImageEditor from '@/components/ReadingListImageEditor';
import { contentMediaUrl } from '@/lib/security/content-media';

type Story = { id: string; title: string; cover_url: string | null };
type ListDetail = {
  list: { name: string; description: string; is_public: boolean; image_url: string | null };
  stories: Story[];
  order: string[];
};

export default function ReadingListPage() {
  const { id } = useParams<{ id: string }>();
  return <ReadingListDetail key={id} id={id} />;
}

function ReadingListDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<ListDetail>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const dragging = useRef<number | null>(null);
  const touchIndex = useRef<number | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/reading-lists?id=' + encodeURIComponent(id), { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!controller.signal.aborted) setDetail(result);
      }).catch(failure => {
        if (!controller.signal.aborted) setError(failure.message);
      });
    return () => controller.abort();
  }, [id, revision]);

  async function update(method: string, payload: Record<string, unknown>) {
    const response = await fetch('/api/reading-lists', {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listId: id, ...payload }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível salvar a lista.');
  }

  async function move(from: number, to: number) {
    if (!detail || busy || from === to || to < 0 || to >= detail.stories.length) return;
    const previous = detail;
    const stories = [...detail.stories];
    const [moved] = stories.splice(from, 1);
    stories.splice(to, 0, moved);
    // Keep unavailable stories in their positions while rearranging visible ones.
    const visibleIds = new Set(stories.map(story => story.id));
    let index = 0;
    const order = detail.order.map(storyId => visibleIds.has(storyId) ? stories[index++].id : storyId);
    setBusy(true);
    setError('');
    setNotice('');
    setDetail({ ...detail, stories, order });
    try {
      await update('PATCH', { action: 'reorder', ids: order });
      if (mounted.current) setNotice('Ordem salva.');
    } catch (failure) {
      if (!mounted.current) return;
      setDetail(current => current && { ...current, stories: previous.stories, order: previous.order });
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar a ordem.');
    } finally {
      setBusy(false);
    }
  }

  async function removeStory(storyId: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await update('DELETE', { storyId });
      if (!mounted.current) return;
      setDetail(previous => previous && {
        ...previous,
        stories: previous.stories.filter(story => story.id !== storyId),
        order: previous.order.filter(item => item !== storyId),
      });
      setNotice('História retirada da lista.');
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Não foi possível retirar a história.');
    } finally {
      setBusy(false);
    }
  }

  async function changeVisibility(isPublic: boolean) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await update('PATCH', { action: 'visibility', is_public: isPublic });
      if (!mounted.current) return;
      setDetail(previous => previous && { ...previous, list: { ...previous.list, is_public: isPublic } });
      setNotice(isPublic ? 'Lista visível no seu perfil.' : 'Lista privada.');
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="mx-auto min-h-screen max-w-4xl space-y-5 p-5 text-white">
    <Link href="/listas-de-leitura" className="text-pink-200">← Minhas listas</Link>
    {error && <div role="alert" className="space-y-2 text-rose-200"><p>{error}</p>
      <button type="button" disabled={busy} className="discovery-secondary" onClick={() => {
        setError('');
        setRevision(value => value + 1);
      }}>Atualizar lista</button>
    </div>}
    {notice && <p role="status" className="text-sm text-pink-200">{notice}</p>}
    {!detail && !error && <p role="status">Carregando lista…</p>}
    {detail && <>
      <h1 className="break-words text-2xl font-bold">{detail.list.name}</h1>
      {detail.list.description && <p className="break-words text-white/70">{detail.list.description}</p>}
      <ReadingListImageEditor key={id} listId={id} imageUrl={detail.list.image_url}
        onSaved={image_url => {
          if (mounted.current) setDetail(previous => previous && { ...previous, list: { ...previous.list, image_url } });
        }} />
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input type="checkbox" checked={detail.list.is_public} disabled={busy}
          className="h-4 w-4 accent-pink-300" onChange={event => void changeVisibility(event.target.checked)} />
        Mostrar esta lista no meu perfil
      </label>
      {detail.stories.length > 1 && <p className="text-sm text-white/60">Arraste pela alça ou use as setas para ordenar. A ordem é salva automaticamente.</p>}
      {detail.stories.length ? <ol className="grid gap-2">{detail.stories.map((story, index) =>
        <li key={story.id} data-story-id={story.id}
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
          onDrop={event => {
            event.preventDefault();
            if (dragging.current !== null) void move(dragging.current, index);
            dragging.current = null;
          }}
          className="flex items-center gap-2 rounded-lg border border-white/15 p-2 sm:gap-3">
          <span draggable={!busy} aria-label={'Arrastar ' + story.title}
            onDragStart={event => { dragging.current = index; event.dataTransfer.effectAllowed = 'move'; }}
            onDragEnd={() => { dragging.current = null; }}
            onTouchStart={() => { if (!busy) touchIndex.current = index; }}
            onTouchCancel={() => { touchIndex.current = null; }}
            onTouchEnd={event => {
              const touch = event.changedTouches[0];
              const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('[data-story-id]');
              const to = detail.stories.findIndex(item => item.id === target?.getAttribute('data-story-id'));
              if (touchIndex.current !== null && to >= 0) void move(touchIndex.current, to);
              touchIndex.current = null;
            }}
            style={{ touchAction: 'none' }} className="cursor-grab p-2 text-white/50 active:cursor-grabbing">
            <GripVertical size={18} aria-hidden="true" />
          </span>
          <Link href={'/historia/' + story.id} className="flex min-w-0 flex-1 items-center gap-3 hover:text-pink-200">
            {story.cover_url && <img src={contentMediaUrl(story.cover_url, 'cover')} alt=""
              className="hidden h-16 w-11 shrink-0 rounded object-cover sm:block" loading="lazy" />}
            <span className="break-words text-sm">{story.title}</span>
          </Link>
          <div className="flex shrink-0 flex-col">
            <button type="button" disabled={busy || index === 0} aria-label={'Subir ' + story.title}
              className="grid h-9 w-9 place-items-center disabled:opacity-25" onClick={() => void move(index, index - 1)}>
              <ArrowUp size={17} aria-hidden="true" />
            </button>
            <button type="button" disabled={busy || index === detail.stories.length - 1} aria-label={'Descer ' + story.title}
              className="grid h-9 w-9 place-items-center disabled:opacity-25" onClick={() => void move(index, index + 1)}>
              <ArrowDown size={17} aria-hidden="true" />
            </button>
          </div>
          <button type="button" disabled={busy} aria-label={`Retirar ${story.title} da lista`}
            className="shrink-0 px-2 py-3 text-xs text-pink-200" onClick={() => void removeStory(story.id)}>Retirar</button>
        </li>
      )}</ol> : <p>Esta lista ainda não tem histórias disponíveis.</p>}
    </>}
  </main>;
}
