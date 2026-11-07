'use client';
import { useState } from 'react';
import ImageCropDialog from './ImageCropDialog';
export default function GroupPhoto({
  threadId,
  hasPhoto,
  onSaved,
}: {
  threadId: string;
  hasPhoto: boolean;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function save(image?: File) {
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      if (image) form.append('file', image);
      const response = await fetch(`/api/chat/groups/${threadId}/avatar`, {
        method: image ? 'POST' : 'DELETE',
        ...(image ? { body: form } : {}),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw Error(data.error || 'Não foi possível alterar a foto.');
      }
      setFile(null);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Tente novamente.');
      throw cause;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="border-b border-white/10 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <label
          className={
            'nook-choice cursor-pointer ' +
            (busy ? 'pointer-events-none opacity-50' : '')
          }
        >
          {hasPhoto ? 'Alterar foto do grupo' : 'Adicionar foto do grupo'}
          <input
            type="file"
            className="sr-only"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => {
              const selected = event.target.files?.[0];
              event.target.value = '';
              if (selected) {
                setError('');
                setFile(selected);
              }
            }}
          />
        </label>
        {hasPhoto && (
          <button
            disabled={busy}
            className="nook-choice"
            onClick={() => void save().catch(() => {})}
          >
            Remover foto
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-200">
          {error}
        </p>
      )}
      {file && (
        <ImageCropDialog
          source={file}
          kind="avatar"
          onCancel={() => setFile(null)}
          onSave={(image) => save(image)}
        />
      )}
    </div>
  );
}
