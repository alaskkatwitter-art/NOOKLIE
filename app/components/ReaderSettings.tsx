'use client';

import { useState } from 'react';
import { DEFAULT_READER_PREFERENCES, READER_FONTS, type ReaderPreferences } from '@/lib/reader/preferences';

type Props = { value: ReaderPreferences; onChange: (value: ReaderPreferences) => void; ready: boolean; status: string };

export default function ReaderSettings({ value, onChange, ready, status }: Props) {
  const [open, setOpen] = useState(false);
  return <section className="reader-settings mb-6 text-white" aria-label="Personalização da leitura">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="reader-settings" className="min-h-11 rounded-full border border-white/10 bg-white/[.03] px-4 text-left text-xs font-semibold text-[#ffb9da] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff9aca]">{open ? 'Fechar opções de leitura' : 'Personalizar leitura'} <span aria-hidden="true">{open ? '−' : '+'}</span></button>
    {open && <div id="reader-settings" className="mt-4 space-y-5">
      <p className="text-sm leading-6 text-white/75">Ajuste a aparência dos capítulos. O texto original e os comentários permanecem preservados.</p>
      <fieldset disabled={!ready} className="space-y-5 disabled:opacity-60">
        <legend className="sr-only">Fonte, tamanho, espaçamento, margens e tema</legend>
        <fieldset><legend className="mb-3 text-sm font-bold">Fonte do capítulo</legend>
          <div className="grid max-h-80 gap-2 overflow-y-auto rounded-xl border border-white/10 p-2 sm:grid-cols-2" role="group" aria-label="Prévia real das fontes">
            {READER_FONTS.map((font) => <label key={font.id} className={`flex min-w-0 cursor-pointer gap-3 rounded-xl border p-3 ${value.fontId === font.id ? 'border-[#ff9aca] bg-[#ff78b9]/10' : 'border-white/15'}`}>
              <input type="radio" name="reader-font" value={font.id} checked={value.fontId === font.id} onChange={() => onChange({ ...value, fontId: font.id })} className="mt-1 size-4 shrink-0 accent-[#ff78b9]" />
              <span className="min-w-0"><span className="block text-xs font-semibold">{font.name}</span><span className="mt-1 block break-words text-base leading-7" style={{ fontFamily: font.family }} lang="pt-BR">De escritor para escritor.</span></span>
            </label>)}
          </div>
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="block text-sm">Tamanho: {value.fontSize}<input aria-label="Tamanho da fonte" type="range" min="14" max="40" step="1" value={value.fontSize} onChange={(event) => onChange({ ...value, fontSize: Number(event.target.value) })} className="mt-3 block min-h-8 w-full accent-[#ff78b9]" /></label>
          <label className="block text-sm">Entrelinhas: {value.lineHeight.toFixed(2)}<input aria-label="Espaçamento entre linhas" type="range" min="1.2" max="2.5" step="0.05" value={value.lineHeight} onChange={(event) => onChange({ ...value, lineHeight: Number(event.target.value) })} className="mt-3 block min-h-8 w-full accent-[#ff78b9]" /></label>
          <label className="block text-sm">Margens: {value.margin}<input aria-label="Margens de leitura" type="range" min="0" max="64" step="4" value={value.margin} onChange={(event) => onChange({ ...value, margin: Number(event.target.value) })} className="mt-3 block min-h-8 w-full accent-[#ff78b9]" /></label>
          <label className="block text-sm">Tema<select value={value.theme} onChange={(event) => onChange({ ...value, theme: event.target.value as ReaderPreferences['theme'] })} className="mt-2 min-h-11 w-full rounded-lg border border-white/20 bg-[#17121b] p-2"><option value="dark">Escuro</option><option value="light">Claro</option><option value="sepia">Sépia</option><option value="system">Seguir o dispositivo</option></select></label>
        </div>
        <button type="button" onClick={() => onChange({ ...DEFAULT_READER_PREFERENCES })} className="min-h-11 rounded-xl border border-white/20 px-4 py-2 text-sm">Restaurar padrão</button>
      </fieldset>
      <p role="status" aria-live="polite" className="text-xs leading-6 text-white/75">{status}</p>
      <a href="/fonts/LICENSES.txt" className="inline-block min-h-11 py-2 text-xs text-[#ff9aca] underline">Licenças das fontes</a>
    </div>}
  </section>;
}
