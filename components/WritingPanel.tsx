'use client';
import { useRef, useState } from 'react';
import FormattedSynopsis from './FormattedSynopsis';

export default function WritingPanel({ value, onChange, maxLength = 2000 }: { value: string; onChange: (value: string) => void; maxLength?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState(false);
  function insert(before: string, after = '') {
    const input = ref.current;
    if (!input) return;
    const { selectionStart: start, selectionEnd: end } = input;
    const next = value.slice(0, start) + before + value.slice(start, end) + after + value.slice(end);
    if (next.length > maxLength) return;
    onChange(next);
    requestAnimationFrame(() => { input.focus(); input.setSelectionRange(start + before.length, end + before.length); });
  }
  return <div className="overflow-hidden rounded-2xl border border-white/15 bg-[#100b12]">
    <div role="toolbar" aria-label="Ferramentas da sinopse" className="flex flex-wrap gap-2 border-b border-white/10 p-2 text-sm">
      <button type="button" disabled={preview} onClick={() => insert('**', '**')} className="min-h-11 rounded-lg px-3 font-bold hover:bg-white/10 disabled:opacity-30">Negrito</button>
      <button type="button" disabled={preview} onClick={() => insert('*', '*')} className="min-h-11 rounded-lg px-3 italic hover:bg-white/10 disabled:opacity-30">Itálico</button>
      <button type="button" disabled={preview} onClick={() => insert('\n## ')} className="min-h-11 rounded-lg px-3 hover:bg-white/10 disabled:opacity-30">Subtítulo</button>
      <button type="button" onClick={() => insert('“', '”')} className="min-h-11 rounded-lg px-3 hover:bg-white/10">“ Citação</button>
      <button type="button" onClick={() => insert('\n— ')} className="min-h-11 rounded-lg px-3 hover:bg-white/10">— Diálogo</button>
      <button type="button" onClick={() => insert('\n\n✦ ✦ ✦\n\n')} className="min-h-11 rounded-lg px-3 hover:bg-white/10">✦ Separador</button>
      <button type="button" aria-pressed={expanded} onClick={() => setExpanded(!expanded)} className="ml-auto min-h-11 rounded-lg px-3 text-[#ff9bca]">{expanded ? 'Reduzir painel' : 'Ampliar painel'}</button>
      <button type="button" aria-pressed={preview} onClick={() => setPreview(!preview)} className="min-h-11 rounded-lg px-3 text-[#ff9bca]">{preview ? 'Editar' : 'Visualizar'}</button>
    </div>
    {preview ? <div className="min-h-80 p-5 leading-8 sm:p-8"><FormattedSynopsis text={value || 'Sua sinopse aparecerá aqui.'} /></div> : <textarea ref={ref} aria-label="Sinopse da história" value={value} onChange={e => onChange(e.target.value)} maxLength={maxLength} rows={expanded ? 28 : 14} placeholder="Apresente seu universo e convide o leitor a entrar…" className="w-full resize-y bg-transparent p-5 text-base leading-8 outline-none focus:ring-2 focus:ring-inset focus:ring-[#ff78b9] sm:p-8" />}
    <div className="flex justify-between border-t border-white/10 px-4 py-3 text-xs text-white/60"><span>{value.trim() ? value.trim().split(/\s+/).length : 0} palavras</span><span>{value.length}/{maxLength} caracteres</span></div>
  </div>;
}
