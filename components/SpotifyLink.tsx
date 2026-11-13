import { ArrowUpRight, Music2 } from 'lucide-react';
import { parseSpotifyUrl, spotifyImage, type SpotifyLink } from '@/lib/spotify/link';

export function SpotifyCard({ value, label }: { value?: SpotifyLink | null; label: string }) {
  const item = parseSpotifyUrl(value?.url);
  if (!item || !value) return null;
  const image = spotifyImage(value.image);

  return (
    <a className="spotify-card" href={item.url} target="_blank" rel="noopener noreferrer">
      {image
        ? <img className="spotify-cover" src={image} alt="" width={48} height={48} loading="lazy" referrerPolicy="no-referrer" />
        : <span className="spotify-cover"><Music2 size={20} aria-hidden="true" /></span>}
      <span className="min-w-0">
        <span className="spotify-label">{label} · Spotify</span>
        <strong className="block break-words">{value.title || item.label}</strong>
      </span>
      <ArrowUpRight className="ml-auto shrink-0" size={17} aria-hidden="true" />
      <span className="sr-only">Abrir no Spotify em nova aba</span>
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
          onChange={event => onChange(event.target.value)} placeholder={`https://open.spotify.com/${playlistOnly ? 'playlist' : 'track'}/…`} />
      </label>
      <p className="spotify-label mt-2">Opcional. A prévia aparece após salvar. Para remover, apague o link.</p>
      {saved?.url === parseSpotifyUrl(value, playlistOnly)?.url && <SpotifyCard value={saved} label={label} />}
    </div>
  );
}
