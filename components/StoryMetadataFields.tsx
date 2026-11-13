'use client';
import { useEffect, useId, useState } from 'react';
import { StoryMetadata, storyFormats, storyKinds } from '@/lib/stories/metadata';

export function StoryKindFields({ value, onChange }: { value: StoryMetadata; onChange: (value: StoryMetadata) => void }) {
  const fandomListId = useId();
  const [fandoms, setFandoms] = useState<{ id: string; name: string }[]>([]);
  const isOriginal = value.story_kind === 'original';
  useEffect(() => {
    if (isOriginal) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch('/api/tags?category=fandom&q=' + encodeURIComponent(value.fandom.slice(0, 100)), { signal: controller.signal })
        .then(response => response.json()).then(data => setFandoms(data.tags ?? [])).catch(() => {});
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [isOriginal, value.fandom]);
  return (
    <fieldset className="min-w-0 space-y-5 rounded-2xl border border-pink-300/20 bg-gradient-to-br from-[#33172a] to-[#160e18] p-4 sm:p-5">
      <legend className="max-w-full px-2 text-sm font-bold leading-6 text-pink-200 [overflow-wrap:anywhere]">Que tipo de história você vai publicar?</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(storyKinds).map(([kind, label]) => (
          <label key={kind} className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3 ${value.story_kind === kind ? 'border-pink-300/60 bg-pink-400/10' : 'border-white/15'}`}>
            <input type="radio" name="story-kind-choice" checked={value.story_kind === kind} className="mt-1 shrink-0 accent-pink-400" onChange={() => onChange({ ...value, story_kind: kind as StoryMetadata['story_kind'], ...(kind === 'fanfic' ? { series_name: '', series_volume: null } : {}) })} />
            <span className="min-w-0 [overflow-wrap:anywhere]"><strong className="block">{label}</strong><span className="text-sm text-white/65">{kind === 'original' ? 'Seu livro, conto, poema ou universo autoral.' : 'Sua história inspirada em um fandom.'}</span></span>
          </label>
        ))}
      </div>
      {value.story_kind === 'original' && (
        <details className="rounded-xl border border-white/15 p-3" open={value.series_name ? true : undefined}>
          <summary className="cursor-pointer text-sm font-semibold text-pink-200">Faz parte de uma série ou saga?</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <label className="text-sm">Nome da série
              <input maxLength={100} value={value.series_name} onChange={event => onChange({ ...value, series_name: event.target.value })} className="mt-1 w-full rounded-xl border border-white/20 bg-[#100b12] p-3" />
            </label>
            <label className="text-sm">Volume
              <input type="number" min={1} max={999} value={value.series_volume ?? ''} onChange={event => onChange({ ...value, series_volume: event.target.value ? Number(event.target.value) : null })} className="mt-1 w-full rounded-xl border border-white/20 bg-[#100b12] p-3" />
            </label>
          </div>
          <p className="mt-2 text-xs leading-5 text-white/65">Use o mesmo nome nos livros que fazem parte da série e informe a ordem de cada um.</p>
        </details>
      )}
      {value.story_kind === 'original' ? (
        <label className="block text-sm font-semibold">Formato literário
          <select value={value.story_format} onChange={e => onChange({ ...value, story_format: e.target.value as StoryMetadata['story_format'] })} className="mt-2 w-full rounded-xl border border-white/20 bg-[#100b12] p-3">
            <option value="">Escolher depois</option>
            {Object.entries(storyFormats).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      ) : (
        <label className="block text-sm font-semibold">Fandom ou universo
          <input list={fandomListId} value={value.fandom} onChange={e => onChange({ ...value, fandom: e.target.value })} maxLength={200} placeholder="Ex.: Harry Potter, BTS…" className="mt-2 w-full rounded-xl border border-white/20 bg-[#100b12] p-3" />
          <datalist id={fandomListId}>{fandoms.map(fandom => <option key={fandom.id} value={fandom.name} />)}</datalist>
        </label>
      )}
    </fieldset>
  );
}

export default function StoryMetadataFields({ value, onChange }: { value: StoryMetadata; onChange: (value: StoryMetadata) => void }) {
  const hasWarnings = value.has_content_warnings;
  const setHasWarnings = (checked: boolean) => onChange({ ...value, has_content_warnings: checked, content_warnings: checked ? value.content_warnings : '' });
  return <section className="min-w-0 rounded-3xl border border-[#ff78b9]/20 bg-[#21131e] p-5 text-white sm:p-8">
    <p className="text-xs font-bold uppercase tracking-widest text-[#ff9bca]">Sua obra, suas escolhas</p>
    <h2 className="mt-2 text-xl font-bold">Avisos e permissões</h2>
    <fieldset className="mt-6 min-w-0 space-y-3"><legend className="mb-3 text-sm font-semibold">Transparência sobre IA</legend>
      {([['work_has_ai', 'Esta obra tem IA'], ['cover_has_ai', 'Esta capa tem IA']] as const).map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 p-3"><input type="checkbox" checked={value[key]} onChange={e => onChange({ ...value, [key]: e.target.checked })} className="h-5 w-5 shrink-0 accent-[#ff78b9]" />{label}</label>)}
    </fieldset>
    <label className="mt-6 flex min-h-11 items-center gap-3"><input type="checkbox" checked={value.allows_download} onChange={e => onChange({ ...value, allows_download: e.target.checked })} className="h-5 w-5 shrink-0 accent-[#ff78b9]" />Permito baixar esta obra em EPUB ou PDF</label>
    <label className="mt-6 flex min-h-11 items-center gap-3"><input type="checkbox" checked={hasWarnings} onChange={e => setHasWarnings(e.target.checked)} className="h-5 w-5 shrink-0 accent-[#ff78b9]" />Esta obra tem avisos de conteúdo e gatilhos</label>
    {hasWarnings && <label className="mt-2 block text-sm">Quais temas o leitor precisa conhecer antes de ler?
      <textarea value={value.content_warnings} onChange={e => onChange({ ...value, content_warnings: e.target.value })} maxLength={2000} rows={5} placeholder="Ex.: violência, luto, abuso. Evite detalhes gráficos." className="mt-2 w-full resize-y rounded-xl border border-[#ff78b9]/30 bg-[#100b12] p-4 leading-7" />
    </label>}
    <label className="mt-6 flex min-h-11 items-center gap-3"><input type="checkbox" checked={value.accepts_translation} onChange={e => onChange({ ...value, accepts_translation: e.target.checked })} className="h-5 w-5 shrink-0 accent-[#ff78b9]" />Aceito propostas de tradução desta obra</label>
    <p className="mt-2 text-sm leading-6 text-white/60">Essa opção permite receber propostas. A tradução só pode ser publicada depois da sua autorização expressa e com os créditos combinados.</p>
  </section>;
}
