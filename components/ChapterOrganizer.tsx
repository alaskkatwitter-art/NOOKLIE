'use client';
import { useRef, useState } from 'react';

type Chapter = { id: string; chapter_number: number; title: string; published: boolean; publication_status?: string };
type Props = { chapters: Chapter[]; selectedId?: string | null; onSelect: (id: string) => void; onMove: (from: number, to: number) => Promise<void>; onDelete: (id: string) => Promise<void>; busy: boolean };
export default function ChapterOrganizer({ chapters, selectedId, onSelect, onMove, onDelete, busy }: Props) {
  const dragged = useRef<number | null>(null);
  const touchIndex = useRef<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  async function move(from: number, to: number) {
    if (working || busy || from === to || from < 0 || to < 0 || to >= chapters.length) return;
    setWorking(true);
    try { await onMove(from, to); } catch { /* The editor displays the error. */ } finally { setWorking(false); }
  }
  async function remove() {
    if (!pendingDelete || busy || working) return;
    setWorking(true);
    try { await onDelete(pendingDelete); setPendingDelete(null); } catch { /* Keep the confirmation open on failure. */ } finally { setWorking(false); }
  }
  return <div className="mt-3 space-y-2" aria-label="Organizar capítulos">
    <p className="text-xs text-gray-400">Arraste pela alça para reorganizar ou use as setas. As alterações são salvas automaticamente.</p>
    {chapters.map((chapter, index) => <div key={chapter.id} data-chapter-id={chapter.id}
      onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; }}
      onDrop={event => { event.preventDefault(); if (dragged.current !== null) void move(dragged.current, index); dragged.current = null; }}
      className={`flex items-center gap-2 rounded-lg border p-2 ${selectedId === chapter.id ? 'border-pink-400/50 bg-pink-500/10' : 'border-white/10 bg-black/20'}`}>
      <span draggable={!busy && !working}
        aria-label={`Arrastar capítulo ${index + 1}`} title="Arraste para mudar a ordem"
        onDragStart={event => { dragged.current = index; event.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => { dragged.current = null; }}
        onTouchStart={() => { touchIndex.current = index; }}
        onTouchEnd={event => { const touch = event.changedTouches[0]; const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('[data-chapter-id]'); const to = chapters.findIndex(item => item.id === target?.getAttribute('data-chapter-id')); if (touchIndex.current !== null && to >= 0) void move(touchIndex.current, to); touchIndex.current = null; }}
        style={{ touchAction: 'none' }}
        className="cursor-grab select-none rounded px-1 py-3 text-gray-400 active:cursor-grabbing">⠿</span>
      <button type="button" onClick={() => onSelect(chapter.id)} className="min-w-0 flex-1 text-left" disabled={busy || working}>
        <span className="block text-xs text-pink-300">Capítulo {index + 1} · {chapter.publication_status === 'published' || chapter.published ? 'Publicado' : 'Rascunho'}</span>
        <span className="block truncate text-sm text-white">{chapter.title || 'Sem título'}</span>
      </button>
      <div className="flex shrink-0 flex-col gap-1">
        <button type="button" aria-label={`Subir ${chapter.title}`} disabled={busy || working || index === 0} onClick={() => void move(index, index - 1)} className="rounded bg-white/10 px-2 disabled:opacity-30">↑</button>
        <button type="button" aria-label={`Descer ${chapter.title}`} disabled={busy || working || index === chapters.length - 1} onClick={() => void move(index, index + 1)} className="rounded bg-white/10 px-2 disabled:opacity-30">↓</button>
      </div>
      <button type="button" aria-label={`Excluir ${chapter.title}`} disabled={busy || working} onClick={() => setPendingDelete(chapter.id)} className="rounded px-2 py-2 text-xs text-red-300 hover:bg-red-500/10">Excluir</button>
    </div>)}
    {pendingDelete && <div role="alertdialog" aria-modal="true" aria-label="Confirmar exclusão permanente" className="rounded-xl border border-red-500/40 bg-zinc-950 p-4">
      <p className="font-medium text-white">Excluir este capítulo permanentemente?</p>
      <p className="mt-2 text-sm text-gray-300">O texto, comentários, votos, favoritos e demais dados associados serão apagados. Esta ação não pode ser desfeita.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setPendingDelete(null)} disabled={working} className="rounded-lg border border-white/20 px-3 py-2 text-sm">Cancelar</button>
        <button type="button" onClick={() => void remove()} disabled={working} className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white">{working ? 'Excluindo...' : 'Excluir definitivamente'}</button>
      </div>
    </div>}
  </div>;
}
