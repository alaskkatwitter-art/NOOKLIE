'use client';
import { StoryMetadata } from '@/lib/stories/metadata';

export default function StoryMetadataFields({ value, onChange }: { value: StoryMetadata; onChange: (value: StoryMetadata) => void }) {
  const hasWarnings = value.has_content_warnings;
  const setHasWarnings = (checked: boolean) => onChange({ ...value, has_content_warnings: checked, content_warnings: checked ? value.content_warnings : '' });
  return <section className="rounded-3xl border border-[#ff78b9]/20 bg-[#21131e] p-5 text-white sm:p-8">
    <p className="text-xs font-bold uppercase tracking-widest text-[#ff9bca]">Sua obra, suas escolhas</p>
    <h2 className="mt-2 text-xl font-bold">Fandom, avisos e permissões</h2>
    <label className="mt-6 block text-sm font-semibold">Fandom ou universo
      <input value={value.fandom} onChange={e => onChange({ ...value, fandom: e.target.value })} maxLength={200} placeholder="Ex.: universo original, Harry Potter, BTS…" className="mt-2 w-full rounded-xl border border-white/20 bg-[#100b12] p-3" />
    </label>
    <fieldset className="mt-6 space-y-3"><legend className="mb-3 text-sm font-semibold">Transparência sobre IA</legend>
      {([['work_has_ai', 'Esta obra tem IA'], ['cover_has_ai', 'Esta capa tem IA']] as const).map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 p-3"><input type="checkbox" checked={value[key]} onChange={e => onChange({ ...value, [key]: e.target.checked })} className="h-5 w-5 accent-[#ff78b9]" />{label}</label>)}
    </fieldset>
    <label className="mt-6 flex min-h-11 items-center gap-3"><input type="checkbox" checked={hasWarnings} onChange={e => setHasWarnings(e.target.checked)} className="h-5 w-5 accent-[#ff78b9]" />Esta obra tem avisos de conteúdo e gatilhos</label>
    {hasWarnings && <label className="mt-2 block text-sm">Quais temas o leitor precisa conhecer antes de ler?
      <textarea value={value.content_warnings} onChange={e => onChange({ ...value, content_warnings: e.target.value })} maxLength={2000} rows={5} placeholder="Ex.: violência, luto, abuso. Evite detalhes gráficos." className="mt-2 w-full resize-y rounded-xl border border-[#ff78b9]/30 bg-[#100b12] p-4 leading-7" />
    </label>}
    <label className="mt-6 flex min-h-11 items-center gap-3"><input type="checkbox" checked={value.accepts_translation} onChange={e => onChange({ ...value, accepts_translation: e.target.checked })} className="h-5 w-5 accent-[#ff78b9]" />Aceito propostas de tradução desta obra</label>
    <p className="mt-2 text-sm leading-6 text-white/60">Essa opção permite receber propostas. A tradução só pode ser publicada depois da sua autorização expressa e com os créditos combinados.</p>
  </section>;
}
