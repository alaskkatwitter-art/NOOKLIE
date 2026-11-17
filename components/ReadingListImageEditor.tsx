'use client';

import { useRef, useState } from 'react';
import ImageCropDialog from '@/components/ImageCropDialog';
import ReadingListImage from '@/components/ReadingListImage';

export default function ReadingListImageEditor({ listId, imageUrl, onSaved }: {
  listId: string;
  imageUrl: string | null;
  onSaved: (url: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(file?: File) {
    setError('');
    setBusy(true);
    try {
      const form = new FormData();
      if (file) form.set('image', file);
      const response = await fetch('/api/reading-lists/' + listId + '/image', {
        method: file ? 'POST' : 'DELETE',
        ...(file ? { body: form } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar a imagem.');
      onSaved(data.image_url);
      setSource(null);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Não foi possível salvar a imagem.';
      setError(message);
      if (file) throw new Error(message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="space-y-3" aria-label="Imagem da lista">
    <div className="flex flex-wrap items-center gap-4">
      <ReadingListImage src={imageUrl} className="w-32" />
      <div className="space-y-2">
        <input ref={input} type="file" className="sr-only" aria-label="Escolher imagem da lista"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) { setSource(file); setError(''); }
          }} />
        <button type="button" disabled={busy} className="discovery-secondary" onClick={() => input.current?.click()}>
          {imageUrl ? 'Trocar imagem' : 'Adicionar imagem'}
        </button>
        {imageUrl && <button type="button" disabled={busy} className="block px-3 py-2 text-sm text-pink-200"
          onClick={() => void save()}>Remover imagem</button>}
      </div>
    </div>
    {error && !source && <p role="alert" className="text-sm text-rose-200">{error}</p>}
    {source && <ImageCropDialog source={source} kind="avatar" shape="square" title="Ajustar imagem da lista" onCancel={() => setSource(null)} onSave={file => save(file)} />}
  </section>;
}
