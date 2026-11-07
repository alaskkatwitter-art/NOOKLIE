'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { StoryPublication } from '@/lib/stories/publication';

const labels: Record<StoryPublication, string> = {
  published: 'Publicada',
  unpublished: 'Fora do ar',
  scheduled: 'Agendada',
  draft: 'Rascunho',
};

export default function StoryPublicationControls({ storyId, publication, releaseAt, hasPublishedChapter, onChange }: {
  storyId: string;
  publication: StoryPublication;
  releaseAt?: string | null;
  hasPublishedChapter: boolean;
  onChange: (publication: StoryPublication, releaseAt: string | null) => void;
}) {
  const router = useRouter();
  const [date, setDate] = useState('');
  const [confirmation, setConfirmation] = useState<'publish' | 'unpublish' | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function change(action: 'publish' | 'unpublish' | 'schedule') {
    if (busy) return;
    const scheduledFor = action === 'schedule' && date ? new Date(date).toISOString() : null;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/stories/' + storyId + '/publication', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, scheduledFor }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      onChange(result.publication, scheduledFor);
      setConfirmation(null);
      if (action === 'publish') router.push('/historia/' + storyId);
      else setMessage(action === 'schedule' ? 'Publicação agendada.' : 'A obra foi retirada do ar.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível atualizar a publicação.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="mb-5 space-y-3 rounded-2xl border border-pink-300/25 bg-pink-300/5 p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-bold">Publicação da obra</h2>
      <span className="rounded-full bg-pink-300/15 px-3 py-1 text-sm text-pink-200">{labels[publication]}</span>
    </div>
    {publication === 'scheduled' && releaseAt && <p className="text-sm">{new Date(releaseAt).toLocaleString('pt-BR')}</p>}
    {!hasPublishedChapter && <p className="text-sm text-white/70">A obra só fica visível com pelo menos um capítulo publicado. Você pode agendar o primeiro capítulo junto com a obra. <Link href={'/historia/' + storyId + '/novo-capitulo'} className="text-pink-200 underline">Escrever capítulo</Link></p>}
    <div className="flex flex-wrap gap-2">
      {publication !== 'published' && <button type="button" disabled={busy || !hasPublishedChapter} className="nook-primary disabled:opacity-40" onClick={() => setConfirmation('publish')}>Publicar agora</button>}
      {publication !== 'unpublished' && <button type="button" disabled={busy} className="discovery-secondary" onClick={() => setConfirmation('unpublish')}>{publication === 'scheduled' ? 'Cancelar agendamento' : publication === 'draft' ? 'Manter obra fora do ar' : 'Retirar do ar'}</button>}
    </div>
    {confirmation && <div className="space-y-2 rounded-xl border border-white/15 p-3">
      <p>{confirmation === 'publish' ? 'Colocar a obra e seus capítulos publicados no ar agora?' : 'Ocultar a obra e seus capítulos dos leitores?'}</p>
      <button type="button" disabled={busy} className="nook-primary" onClick={() => void change(confirmation)}>Confirmar</button>
      <button type="button" disabled={busy} className="ml-3 p-2 text-sm" onClick={() => setConfirmation(null)}>Voltar</button>
    </div>}
    {publication !== 'published' && <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void change('schedule'); }}>
      <label className="text-sm text-white/75">Agendar a obra · horário do dispositivo
        <input required type="datetime-local" value={date} onChange={event => setDate(event.target.value)} className="mt-1 block min-h-11 rounded-xl border border-white/15 bg-[#171018] px-3 text-white [color-scheme:dark]" />
      </label>
      <button disabled={busy || !date} className="discovery-secondary disabled:opacity-40">Agendar publicação</button>
    </form>}
    {message && <p role="status" className="text-sm text-pink-200">{message}</p>}
    {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
  </section>;
}
