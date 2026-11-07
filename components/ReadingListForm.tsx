'use client';

import { useState, type FormEvent } from 'react';

export default function ReadingListForm({ storyId, onCreated }: {
  storyId?: string;
  onCreated: (id: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/reading-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.get('name'), description: form.get('description'), storyId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      onCreated(result.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível criar a lista.');
    } finally {
      setSaving(false);
    }
  }

  return <form onSubmit={submit} className="space-y-3">
    <label className="block text-sm">Nome da lista
      <input name="name" required maxLength={80} className="mt-1 block w-full rounded-xl border border-white/20 bg-black/25 p-3" />
    </label>
    <label className="block text-sm">Descrição opcional
      <textarea name="description" maxLength={240} rows={2} className="mt-1 block w-full rounded-xl border border-white/20 bg-black/25 p-3" />
    </label>
    {error && <p role="alert" className="text-pink-200">{error}</p>}
    <button disabled={saving} className="rounded-full bg-pink-300 px-4 py-2 font-bold text-[#190d16] disabled:opacity-50">
      {saving ? 'Salvando…' : storyId ? 'Criar lista e adicionar história' : 'Criar lista'}
    </button>
  </form>;
}
