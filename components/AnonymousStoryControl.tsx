'use client';

import { useState } from 'react';

export default function AnonymousStoryControl({ storyId, isAnonymous, onChanged }: { storyId: string; isAnonymous: boolean; onChanged: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    const next = !isAnonymous;
    if (!window.confirm(next
      ? 'Ocultar sua autoria desta história em páginas públicas?'
      : 'Revelar seu perfil como autor desta história?')) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/stories/${encodeURIComponent(storyId)}/anonymity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_anonymous: next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível alterar o anonimato.');
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível alterar o anonimato.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="mt-3">
    <button type="button" disabled={saving} onClick={toggle} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-white/70 hover:border-pink-400/30 hover:text-white disabled:opacity-50">
      {saving ? 'Salvando…' : isAnonymous ? 'Revelar autoria' : 'Publicar anonimamente'}
    </button>
    {error && <p className="mt-2 text-sm text-rose-300" role="alert">{error}</p>}
  </div>;
}
