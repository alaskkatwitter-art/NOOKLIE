import { ArrowUpRight, Music2 } from 'lucide-react';
import { parseSoundtrackUrl, spotifyImage, type SpotifyLink } from '@/lib/spotify/link';

export function SpotifyCard({ value, label }: { value?: SpotifyLink | null; label: string }) {
  const item = parseSoundtrackUrl(value?.url);
  if (!item || !value) return null;
  const image = item.thumbnail ?? spotifyImage(value.image);

  return (
    <a className="spotify-card" href={item.url} target="_blank" rel="noopener noreferrer">
      {image
        ? <img className="spotify-cover" src={image} alt="" width={48} height={48} loading="lazy" referrerPolicy="no-referrer" />
        : <span className="spotify-cover"><Music2 size={20} aria-hidden="true" /></span>}
      <span className="min-w-0">
        <span className="spotify-label">{label} · {item.provider}</span>
        <strong className="block break-words">{value.title || item.label}</strong>
        {value.artists && <span className="spotify-label break-words">{value.artists}</span>}
      </span>
      <ArrowUpRight className="ml-auto shrink-0" size={17} aria-hidden="true" />
      <span className="sr-only">Abrir no {item.provider} em nova aba</span>
    </a>
  );
}

export function SpotifyField({ label, value, onChange, saved, playlistOnly = false }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  saved?: SpotifyLink | null;
  playlistOnly?: boolean;
}) {
  return (
    <div className="spotify-field">
      <label className="block">
        <span className="mb-2 block text-sm font-semibold">{label}</span>
        <input className="nook-input w-full" type="url" maxLength={512} value={value}
          onChange={event => onChange(event.target.value)} placeholder="Cole o link aqui" />
      </label>
      <p className="spotify-label mt-2">{playlistOnly ? 'Playlist do Spotify ou vídeo do YouTube.' : 'Link do Spotify ou vídeo do YouTube.'} Para remover, apague o link.</p>
      {saved?.url === parseSoundtrackUrl(value, playlistOnly)?.url && <SpotifyCard value={saved} label={label} />}
    </div>
  );
}
