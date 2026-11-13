'use client';

import { useState } from 'react';
import { Download } from 'lucide-react';

export default function BookDownloads({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function download(format: 'epub' | 'pdf') {
    setBusy(true);
    setMessage('Preparando seu livro…');
    try {
      const { downloadBook } = await import('@/lib/books/download');
      await downloadBook(id, format);
      setMessage('Livro pronto para baixar.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível preparar o livro.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="mt-5">
    <div className="flex flex-wrap gap-2">
      {(['epub', 'pdf'] as const).map(format => <button key={format} type="button" disabled={busy}
        className="inline-flex min-h-11 items-center gap-2 rounded-md border border-pink-300/25 px-3 text-sm font-semibold text-pink-100 disabled:opacity-50"
        onClick={() => void download(format)}><Download size={16} aria-hidden="true" /> Baixar {format.toUpperCase()}</button>)}
    </div>
    {message && <p role="status" className="mt-2 text-sm text-pink-100">{message}</p>}
  </div>;
}
