'use client';

import { useState, type CSSProperties } from 'react';
import ProfileBanner from '@/components/ProfileBanner';
import {
  maxProfileThemes, parseProfileTheme, parseProfileThemeCollection, profileThemePresets, profileThemeVariables,
  themeColors, themeContrastIsReadable, themeFonts, themeNameKey,
  type ProfileTheme, type ProfileThemeCollection,
} from '@/lib/profile/themes';

type Props = {
  collection: ProfileThemeCollection;
  onChange: (value: ProfileThemeCollection) => void;
  cover: string | null;
  username: string;
};

export default function ProfileThemeEditor({ collection, onChange, cover, username }: Props) {
  const [draft, setDraft] = useState(collection.active ?? profileThemePresets[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const readable = themeContrastIsReadable(draft);

  async function persist(mode: 'save' | 'publish' | 'reset' | 'delete') {
    const validated = parseProfileTheme(draft);
    const existing = collection.drafts.findIndex(theme => themeNameKey(theme.name) === themeNameKey(draft.name));
    let drafts = collection.drafts;
    if (mode === 'save' || mode === 'publish') {
      if (!validated) return;
      drafts = existing < 0 ? [...drafts, validated] : drafts.map((theme, index) => index === existing ? validated : theme);
      if (drafts.length > maxProfileThemes) {
        setError(`Você pode guardar até ${maxProfileThemes} temas. Exclua um rascunho para salvar outro.`);
        return;
      }
    } else if (mode === 'delete') {
      drafts = drafts.filter((_, index) => index !== existing);
    }
    const active = mode === 'reset' ? null : mode === 'publish' ? validated : collection.active;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/profile/themes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drafts, active, revision: collection.revision }),
      });
      const result = await response.json();
      const saved = parseProfileThemeCollection(result);
      if (!response.ok || !saved) throw Error(result.error || 'Não foi possível salvar seus temas.');
      onChange(saved);
      const notices = {
        save: 'Rascunho salvo.',
        publish: 'Tema publicado no seu perfil.',
        reset: 'Tema padrão restaurado.',
        delete: 'Rascunho excluído.',
      };
      setNotice(notices[mode]);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível salvar seus temas.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="rounded-2xl border border-white/10 bg-[#100b12] p-4">
      <summary className="min-h-8 cursor-pointer font-bold">Aparência do perfil · Meus temas</summary>
      <p className="mt-2 text-sm text-white/75">{collection.active ? `Tema publicado: ${collection.active.name}` : 'Seu perfil está usando o tema padrão.'}</p>
      <fieldset disabled={saving} className="mt-4 space-y-4">
        <legend className="sr-only">Editor de temas públicos</legend>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Galeria de temas</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {profileThemePresets.map(theme => (
              <button key={theme.name} type="button" onClick={() => setDraft(theme)} className="min-h-12 rounded-xl border px-2 py-2 text-xs font-bold focus-visible:outline-2 focus-visible:outline-pink-200"
                style={{ color: theme.text, borderColor: theme.border, background: `linear-gradient(120deg, ${theme.background}, ${theme.gradient})` }}>
                {theme.name}
              </button>
            ))}
          </div>
        </div>
        {collection.drafts.length > 0 && (
          <label className="block text-sm font-semibold">Temas salvos
            <select value="" className="nook-input mt-2 w-full" onChange={event => {
              const theme = collection.drafts[Number(event.target.value)];
              if (event.target.value !== '' && theme) setDraft(theme);
            }}>
              <option value="">Abrir um tema</option>
              {collection.drafts.map((theme, index) => <option key={theme.name} value={index}>{theme.name}</option>)}
            </select>
          </label>
        )}
        <label className="block text-sm font-semibold">Nome do tema
          <input value={draft.name} maxLength={48} onChange={event => setDraft({ ...draft, name: event.target.value })} className="nook-input mt-2 w-full" />
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(Object.keys(themeColors) as Array<keyof typeof themeColors>).map(key => (
            <label key={key} className="text-xs font-semibold">{themeColors[key]}
              <input type="color" value={draft[key]} onChange={event => setDraft({ ...draft, [key]: event.target.value })} className="mt-1 block h-11 w-full cursor-pointer rounded-lg border border-white/20" />
            </label>
          ))}
        </div>
        <label className="block text-sm font-semibold">Fonte
          <select value={draft.font} className="nook-input mt-2 w-full" onChange={event => {
            const font = event.target.value as ProfileTheme['font'];
            if (Object.hasOwn(themeFonts, font)) setDraft({ ...draft, font });
          }}>
            {Object.entries(themeFonts).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <div aria-label="Prévia do tema" data-profile-theme="" className="profile-theme-preview overflow-hidden rounded-2xl border"
          style={profileThemeVariables(draft) as CSSProperties}>
          <ProfileBanner cover={cover} />
          <div className="profile-themed-surface space-y-2 border-t p-4">
            <p className="font-bold">@{username}</p>
            <p className="text-sm">Prévia do texto e dos cartões do perfil.</p>
            <span className="profile-themed-action inline-flex rounded-full px-3 py-2 text-xs font-bold">Seguir</span>
          </div>
        </div>
        {!readable && <p role="status" className="text-sm text-amber-200">Escolha uma cor de texto com mais contraste com o fundo, os cartões e o degradê.</p>}
        {error && <p role="alert" className="text-sm text-rose-200">{error}</p>}
        {notice && <p role="status" className="text-sm text-emerald-200">{notice}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!draft.name.trim() || !readable} onClick={() => void persist('save')} className="nook-choice">Salvar rascunho</button>
          <button type="button" disabled={!draft.name.trim() || !readable} onClick={() => void persist('publish')} className="nook-primary">Publicar no perfil</button>
          {collection.active && <button type="button" onClick={() => void persist('reset')} className="nook-choice">Usar tema padrão</button>}
          {collection.drafts.some(theme => themeNameKey(theme.name) === themeNameKey(draft.name)) && (
            <button type="button" onClick={() => void persist('delete')} className="nook-choice">Excluir rascunho</button>
          )}
        </div>
      </fieldset>
    </details>
  );
}
