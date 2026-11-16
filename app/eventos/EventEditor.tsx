'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  eventContent, eventEligibility, eventEntryLimits, eventFormats, eventImageBytes,
  eventImageTypes, eventImageUrl, eventMaxImages, eventMaxTopics, eventTextLimit,
  eventTopicLimit, type EventImage, type LiteraryEvent,
} from '@/lib/discovery/events';

type ImageDraft = { key: string; alt: string } & ({ saved: EventImage } | { file: File; preview: string });
const field = 'mt-2 w-full rounded-xl border border-white/20 bg-[#100b12] p-3 text-white';
const box = 'space-y-4 rounded-xl border border-white/10 p-4 sm:p-5';
const defaultRules = 'Respeitar as diretrizes da comunidade e a classificação indicativa.\nA obra deve ser de autoria própria ou coautoria autorizada.';

function localDate(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function TextField({ name, label, initial, rows = 8, limit = eventTextLimit, required = false }: {
  name: string; label: string; initial: string; rows?: number; limit?: number; required?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <label className="block text-sm font-medium">
      {label}
      <textarea name={name} value={value} onChange={e => setValue(e.target.value)} required={required} rows={rows} maxLength={limit} className={field + ' resize-y leading-6'} />
      <span className="mt-1 block text-right text-xs font-normal tabular-nums text-white/60">
        {value.length.toLocaleString('pt-BR')} / {limit.toLocaleString('pt-BR')} caracteres
      </span>
    </label>
  );
}

function ImagePreview({ image, eventId }: { image: ImageDraft; eventId?: string }) {
  const src = 'saved' in image ? eventId && eventImageUrl(eventId, image.saved) : image.preview;
  if (!src) return null;
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img src={src} alt="" className="h-24 w-28 shrink-0 rounded-lg bg-black/30 object-contain" />;
}

export default function EventEditor({ event, busy, onSave, onCancel }: {
  event?: LiteraryEvent;
  busy: boolean;
  onSave: (form: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const content = eventContent(event);
  const createId = useRef<string>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const previews = useRef(new Set<string>());
  const [topics, setTopics] = useState(() => content.topics.map((topic, index) => ({ ...topic, key: 'saved-' + index })));
  const [images, setImages] = useState<ImageDraft[]>(() => content.images.map(saved => ({ key: saved.id, alt: saved.alt, saved })));
  const [error, setError] = useState('');
  const [imageError, setImageError] = useState('');
  const initialStart = localDate(event?.starts_at);
  const initialEnd = localDate(event?.ends_at);

  useEffect(() => {
    heading.current?.focus();
    const urls = previews.current;
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, []);

  function addImages(files: File[]) {
    setImageError('');
    if (images.length + files.length > eventMaxImages) {
      setImageError('Você pode adicionar até três imagens ao evento.');
      return;
    }
    if (files.some(file => !Object.hasOwn(eventImageTypes, file.type) || !file.size || file.size > eventImageBytes)) {
      setImageError('Escolha imagens JPG, PNG ou WebP de até 3 MB cada.');
      return;
    }
    const added = files.map(file => {
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      return { file, preview, key: crypto.randomUUID(), alt: '' };
    });
    setImages(previous => [...previous, ...added]);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const form = new FormData(e.currentTarget);
    const read = (name: string) => String(form.get(name) ?? '');
    const starts = read('starts_at');
    const ends = read('ends_at');
    if (!Number.isFinite(Date.parse(starts)) || !Number.isFinite(Date.parse(ends))) {
      setError('Confira as datas de início e encerramento.');
      return;
    }
    const startsAt = event && starts === initialStart ? event.starts_at : new Date(starts).toISOString();
    const endsAt = event && ends === initialEnd ? event.ends_at : new Date(ends).toISOString();
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      setError('O encerramento deve ser posterior ao início.');
      return;
    }
    const body = new FormData();
    const id = event?.id ?? (createId.current ??= crypto.randomUUID());
    body.set('event', JSON.stringify({
      id,
      revision: event?.revision,
      title: read('title'),
      description: read('description'),
      starts_at: startsAt,
      ends_at: endsAt,
      details: {
        format: read('format'), eligibility: read('eligibility'), entry_limit: read('entry_limit'),
        instructions: read('instructions'), rules: read('rules'),
        topics: topics.map(({ key }) => ({ title: read(key + '-title'), text: read(key + '-text') })),
        images: images.map(image => ({ id: 'saved' in image ? image.saved.id : undefined, alt: image.alt })),
      },
    }));
    images.forEach((image, index) => {
      if ('file' in image) body.set('image-' + index, image.file);
    });
    try {
      await onSave(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o evento.');
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 rounded-2xl border border-[#ffc4df]/25 bg-[#170f18] p-4 sm:p-7">
      <h2 ref={heading} tabIndex={-1} className="text-2xl font-bold">{event ? 'Editar evento literário' : 'Criar evento literário'}</h2>
      <fieldset disabled={busy} className="mt-5 min-w-0 space-y-5">
        <section className={box} aria-label="Informações do evento">
          <label className="block text-sm">Título do evento<input name="title" required maxLength={120} defaultValue={event?.title} className={field} /></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">Início<input type="datetime-local" required name="starts_at" defaultValue={initialStart} className={field} /></label>
            <label className="text-sm">Encerramento<input type="datetime-local" required name="ends_at" defaultValue={initialEnd} className={field} /></label>
          </div>
          <p className="text-xs text-white/65">As datas usam o horário do seu dispositivo.</p>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              { name: 'format', label: 'Formato', options: eventFormats, value: content.format },
              { name: 'eligibility', label: 'Obras aceitas', options: eventEligibility, value: content.eligibility },
              { name: 'entry_limit', label: 'Inscrições por autor', options: eventEntryLimits, value: content.entry_limit },
            ].map(({ name, label, options, value }) => (
              <label key={name} className="text-sm">
                {label}
                <select name={name} defaultValue={event ? value : options[0]} className={field}>
                  <option value="">Escolher depois</option>
                  {options.map(option => <option key={option}>{option}</option>)}
                </select>
              </label>
            ))}
          </div>
          <p className="text-xs leading-5 text-white/65">Os critérios personalizados aparecem como orientações na página do evento. A inscrição automática aplica as verificações gerais do Nooklie.</p>
        </section>
        <section className={box} aria-label="Textos do evento">
          <TextField name="description" label="Descrição" initial={content.description} rows={10} />
          <TextField name="instructions" label="Como participar" initial={content.instructions} />
          <TextField name="rules" label="Regras" initial={event ? content.rules : defaultRules} />
        </section>
        <section className={box} aria-label="Tópicos extras">
          <h3 className="font-semibold">Tópicos extras</h3>
          {topics.map(topic => (
            <div key={topic.key} className="space-y-3 rounded-xl border border-white/10 p-3">
              <label className="block text-sm">
                Título do tópico
                <input name={topic.key + '-title'} defaultValue={topic.title} required maxLength={100} className={field} />
              </label>
              <TextField name={topic.key + '-text'} label="Texto do tópico" initial={topic.text} rows={5} limit={eventTopicLimit} required />
              <button type="button" onClick={() => setTopics(previous => previous.filter(item => item.key !== topic.key))} className="min-h-11 text-sm text-[#ffc4df] underline">Remover tópico</button>
            </div>
          ))}
          {topics.length < eventMaxTopics && (
            <button type="button" onClick={() => {
              const key = crypto.randomUUID();
              setTopics(previous => [...previous, { key, title: '', text: '' }]);
            }} className="discovery-secondary">Adicionar tópico</button>
          )}
        </section>
        <section className={box} aria-label="Imagens do evento">
          <h3 className="font-semibold">Imagens</h3>
          <p className="text-sm text-white/70">A primeira imagem será a capa. Você pode enviar até três imagens JPG, PNG ou WebP de até 3 MB cada.</p>
          {images.map((image, index) => (
            <div key={image.key} className="flex flex-wrap gap-4 rounded-lg border border-white/10 p-3">
              <ImagePreview image={image} eventId={event?.id} />
              <div className="min-w-44 flex-1">
                <p className="text-sm font-medium">{index === 0 ? 'Capa' : 'Imagem ' + (index + 1)}</p>
                <label className="mt-2 block text-xs text-white/75">
                  Texto alternativo
                  <input value={image.alt} maxLength={200} onChange={e => {
                    const alt = e.target.value;
                    setImages(previous => previous.map(item => item.key === image.key ? { ...item, alt } : item));
                  }} className={field} placeholder="Descreva o que aparece na imagem" />
                </label>
                <button type="button" onClick={() => {
                  if ('file' in image) {
                    URL.revokeObjectURL(image.preview);
                    previews.current.delete(image.preview);
                  }
                  setImages(previous => previous.filter(item => item.key !== image.key));
                  setImageError('');
                }} className="min-h-11 text-sm text-[#ffc4df] underline">Remover imagem</button>
              </div>
            </div>
          ))}
          {images.length < eventMaxImages && (
            <label className="block text-sm">
              Selecionar imagens
              <input type="file" multiple accept={Object.keys(eventImageTypes).join(',')} onChange={e => {
                addImages(Array.from(e.currentTarget.files ?? []));
                e.currentTarget.value = '';
              }} className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#ffc4df] file:px-3 file:py-2 file:text-[#28121f]" />
            </label>
          )}
          {imageError && <p role="alert" className="text-sm text-rose-200">{imageError}</p>}
        </section>
        {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
        <div className="flex flex-wrap gap-3">
          <button type="submit" className="discovery-secondary">{busy ? 'Salvando…' : event ? 'Salvar alterações' : 'Publicar evento'}</button>
          <button type="button" onClick={onCancel} className="discovery-secondary">Cancelar</button>
        </div>
      </fieldset>
    </form>
  );
}
