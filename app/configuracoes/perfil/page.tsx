'use client';

import { SpotifyField } from '@/components/SpotifyLink';
import type { SpotifyLink } from '@/lib/spotify/link';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera, SlidersHorizontal } from 'lucide-react';
import AnimatedProfileImage from '@/components/AnimatedProfileImage';
import { profileGifLimits, type ImageFraming, type ProfileAnimation } from '@/lib/profile/animation';
import ImageCropDialog from '@/components/ImageCropDialog';
import ProfileThemeEditor from '@/components/ProfileThemeEditor';
import UiThemeControl from '@/components/UiThemeControl';
import { parseProfileThemeCollection, type ProfileThemeCollection } from '@/lib/profile/themes';
import type { ProfileAvatarPosition, ProfileHeaderLayout } from '@/lib/profile/appearance';
import { contentMediaUrl } from '@/lib/security/content-media';

type User = { spotify_link?: SpotifyLink | null; username: string; display_name: string | null; bio: string | null; avatar_url: string | null; cover_url: string | null; avatar_animation?: ProfileAnimation | null; cover_animation?: ProfileAnimation | null; header_layout?: ProfileHeaderLayout; avatar_position?: ProfileAvatarPosition };
type Kind = 'avatar' | 'cover';

export default function EditProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [themes, setThemes] = useState<ProfileThemeCollection | null>();
  const [tab, setTab] = useState<'photos' | 'themes' | 'details'>('photos');
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [spotifyTitle, setSpotifyTitle] = useState('');
  const [spotifyArtists, setSpotifyArtists] = useState('');
  const [name, setName] = useState(''), [bio, setBio] = useState('');
  const [layout, setLayout] = useState<ProfileHeaderLayout>('classic');
  const [position, setPosition] = useState<ProfileAvatarPosition>('left');
  const [crop, setCrop] = useState<{ source: File | string; kind: Kind; framing?: ImageFraming } | null>(null);
  const [saving, setSaving] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const avatarInput = useRef<HTMLInputElement>(null), coverInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store', signal: controller.signal });
        if (response.status === 401) { router.replace('/login'); return; }
        const data = await response.json();
        if (!response.ok || !data.user) throw Error(data.error || 'Não foi possível abrir seu perfil.');
        if (controller.signal.aborted) return;
        setUser(data.user); setSpotifyUrl(data.user.spotify_link?.url || ''); setSpotifyTitle(data.user.spotify_link?.title === 'Vídeo' ? '' : data.user.spotify_link?.title || ''); setSpotifyArtists(data.user.spotify_link?.artists || ''); setName(data.user.display_name || ''); setBio(data.user.bio || '');
        setLayout(data.user.header_layout || 'classic'); setPosition(data.user.avatar_position || 'left');
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Tente novamente.'); }
    }
    void load();
    fetch('/api/profile/themes', { cache: 'no-store', signal: controller.signal }).then(async response => response.ok ? parseProfileThemeCollection(await response.json()) : null)
      .then(value => { if (!controller.signal.aborted) setThemes(value); }).catch(() => { if (!controller.signal.aborted) setThemes(null); });
    return () => controller.abort();
  }, [router]);

  function choose(event: ChangeEvent<HTMLInputElement>, kind: Kind) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) { setError('Escolha uma imagem JPG, PNG, WebP ou GIF.'); return; }
    const gif = file.type === 'image/gif';
    const limit = profileGifLimits[kind];
    if (file.size > (gif ? limit.bytes : 20 * 1024 * 1024)) {
      setError(gif ? `Use um GIF de até ${limit.label}.` : 'Escolha uma imagem de até 20 MB.');
      return;
    }
    setError(''); setNotice(''); setCrop({ source: file, kind });
  }

  async function saveImage(file: File, animation?: { gif: Blob; framing: ImageFraming }) {
    if (!crop) return;
    const kind = crop.kind; setSaving(true); setError('');
    try {
      const form = new FormData(); form.set('file', file);
      if (animation) {
        form.set('animation', animation.gif, kind + '.gif');
        form.set('framing', JSON.stringify(animation.framing));
      }
      const response = await fetch('/api/profile/' + kind, { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Não foi possível salvar a imagem.');
      setUser(current => current ? { ...current, [kind + '_url']: data[kind + '_url'], [kind + '_animation']: data[kind + '_animation'] } : current);
      setCrop(null); setNotice(kind === 'cover' ? 'Capa e enquadramento salvos.' : 'Foto de perfil salva.');
    } finally { setSaving(false); }
  }

  async function save() {
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/profile/update', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: name, bio, spotify_url: spotifyUrl, spotify_title: spotifyTitle, spotify_artists: spotifyArtists, header_layout: layout, avatar_position: position }) });
      const data = await response.json(); if (!response.ok) throw Error(data.error || 'Não foi possível salvar.');
      setUser(current => current ? { ...current, ...data.user } : current); setNotice('Perfil atualizado.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Tente novamente.'); }
    finally { setSaving(false); }
  }

  return <main className="profile-editor-page"><div className="profile-editor-shell">
    <header><Link href={user ? '/perfil/' + encodeURIComponent(user.username) : '/perfil'} aria-label="Voltar ao perfil"><ArrowLeft size={22}/></Link><h1>Editar perfil</h1></header>
    {error && <p role="alert" className="editor-feedback">{error}</p>}
    {notice && <p role="status" className="editor-feedback">{notice}</p>}
    {!user ? !error && <p role="status">Carregando suas opções…</p> : <>
      <div className="profile-editor-tabs" role="group" aria-label="Opções do perfil">{([['photos','Fotos e capa'],['themes','Temas'],['details','Dados']] as const).map(([value,label]) => <button type="button" key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
      {tab === 'photos' && <section aria-label="Fotos e enquadramento" className="profile-photo-options">
        <div className="editor-cover"><div>{user.cover_animation ? <AnimatedProfileImage poster={user.cover_url} animation={user.cover_animation} kind="cover" alt="Sua capa atual" className="size-full"/> : user.cover_url ? <img src={contentMediaUrl(user.cover_url)} alt="Sua capa atual"/> : <span>Adicione sua capa</span>}</div><div className="editor-photo-actions"><strong>Capa</strong><button type="button" disabled={saving} onClick={() => coverInput.current?.click()}><Camera size={17}/>Trocar</button>{user.cover_url && <button type="button" disabled={saving} onClick={() => setCrop({ source: user.cover_animation?.url || user.cover_url!, kind: 'cover', framing: user.cover_animation || undefined })}><SlidersHorizontal size={17}/>Zoom e posição</button>}</div></div>
        <div className="editor-avatar"><div>{user.avatar_animation ? <AnimatedProfileImage poster={user.avatar_url} animation={user.avatar_animation} kind="avatar" alt="Sua foto atual" className="size-full"/> : user.avatar_url ? <img src={contentMediaUrl(user.avatar_url)} alt="Sua foto atual"/> : <span>{(name || user.username).charAt(0)}</span>}</div><div className="editor-photo-actions"><strong>Foto de perfil</strong><button type="button" disabled={saving} onClick={() => avatarInput.current?.click()}><Camera size={17}/>Trocar</button>{user.avatar_url && <button type="button" disabled={saving} onClick={() => setCrop({ source: user.avatar_animation?.url || user.avatar_url!, kind: 'avatar', framing: user.avatar_animation || undefined })}><SlidersHorizontal size={17}/>Enquadrar</button>}</div></div>
        <p className="editor-hint">Arraste e ajuste o zoom para enquadrar. GIFs de até 500 KB na foto de perfil e 2 MB na capa.</p>
      </section>}
      {tab === 'themes' && <section className="profile-editor-themes"><UiThemeControl/><div className="editor-layout-options"><label>Cabeçalho<select value={layout} onChange={event => setLayout(event.target.value as ProfileHeaderLayout)}><option value="classic">Clássico</option><option value="immersive">Imersivo</option></select></label><label>Avatar<select value={position} onChange={event => setPosition(event.target.value as ProfileAvatarPosition)}><option value="left">Esquerda</option><option value="right">Direita</option></select></label></div>
        {themes ? <ProfileThemeEditor collection={themes} onChange={setThemes} cover={user.cover_url} username={user.username} expanded/> : <p role="status">{themes === undefined ? 'Carregando temas do perfil…' : 'Temas indisponíveis no momento.'}</p>}
      </section>}
      {tab === 'details' && <section className="profile-editor-details"><label>Nome de exibição<input maxLength={50} value={name} onChange={event => setName(event.target.value)}/></label><label>Biografia<textarea rows={4} maxLength={500} value={bio} onChange={event => setBio(event.target.value)}/></label><SpotifyField label="Música do perfil" value={spotifyUrl} onChange={url => { setSpotifyUrl(url); setSpotifyTitle(''); setSpotifyArtists(''); }} saved={user.spotify_link} />{spotifyUrl.trim() && <><label>Nome da música<input className="nook-input w-full" maxLength={300} placeholder="Título do vídeo, se disponível" value={spotifyTitle} onChange={event => setSpotifyTitle(event.target.value)} /></label><label>Artistas<input className="nook-input w-full" maxLength={300} placeholder="Opcional" value={spotifyArtists} onChange={event => setSpotifyArtists(event.target.value)} /></label></>}<Link href="/configuracoes">Configurações da conta</Link></section>}
      {tab !== 'photos' && <button type="button" className="editor-save" disabled={saving} onClick={() => void save()}>{saving ? 'Salvando…' : tab === 'themes' ? 'Salvar cabeçalho' : 'Salvar dados'}</button>}
      <input ref={avatarInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={event => choose(event, 'avatar')}/><input ref={coverInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={event => choose(event, 'cover')}/>
      {crop && <ImageCropDialog source={crop.source} kind={crop.kind} allowGif framing={crop.framing} onCancel={() => setCrop(null)} onSave={saveImage}/>}
    </>}
  </div></main>;
}
