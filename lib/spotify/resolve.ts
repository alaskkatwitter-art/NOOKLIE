import { NextResponse } from 'next/server';
import { parseSoundtrackUrl, parseSpotifyUrl, spotifyImage, type SpotifyLink } from './link';

async function resolveSharedLink(value: unknown, playlistOnly: boolean) {
  const direct = parseSoundtrackUrl(value, playlistOnly);
  if (direct || typeof value !== 'string' || value.length > 512) return direct;

  const shortLink = value.trim().match(/^https:\/\/(?:spotify\.link|spoti\.fi)\/[A-Za-z0-9_-]+(?:\?[^#]*)?$/i);
  if (!shortLink) return null;
  const response = await fetch(shortLink[0], { signal: AbortSignal.timeout(4000), redirect: 'manual' });
  const location = response.headers.get('location');
  const spotify = response.status >= 300 && response.status < 400 ? parseSpotifyUrl(location, playlistOnly) : null;
  return spotify ? { ...spotify, provider: 'Spotify', thumbnail: null } : null;
}

export async function spotifyUpdate(
  value: unknown, existing?: SpotifyLink | null, playlistOnly = false,
): Promise<{ spotify_link?: SpotifyLink | null } | NextResponse> {
  if (value === undefined) return {};
  if (value === null || (typeof value === 'string' && !value.trim())) return { spotify_link: null };

  let parsed: ReturnType<typeof parseSoundtrackUrl>;
  try {
    parsed = await resolveSharedLink(value, playlistOnly);
  } catch {
    return NextResponse.json({
      error: 'Não consegui abrir o link encurtado. Cole o endereço completo de open.spotify.com.',
    }, { status: 400 });
  }
  if (!parsed) return NextResponse.json({
    error: playlistOnly ? 'Cole o link de uma playlist do Spotify ou de um vídeo do YouTube.' : 'Cole um link do Spotify ou de um vídeo do YouTube.',
  }, { status: 400 });

  const fallback = { url: parsed.url, title: parsed.label, image: parsed.thumbnail };
  const sameLink = existing?.url === parsed.url;
  if (sameLink && (existing.title !== fallback.title || (parsed.provider === 'Spotify' && existing.image))) return {};
  const endpoint = new URL(parsed.provider === 'YouTube' ? 'https://www.youtube.com/oembed' : 'https://open.spotify.com/oembed');
  endpoint.searchParams.set('url', parsed.url);
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(4000), redirect: 'error' });
    if (response.ok) {
      const data = await response.json();
      const title = typeof data?.title === 'string' ? data.title.trim().slice(0, 300) : '';
      if (title) return { spotify_link: { url: parsed.url, title, image: parsed.thumbnail ?? spotifyImage(data.thumbnail_url) } };
    }
  } catch {
    // A valid link remains usable when Spotify's preview endpoint is unavailable.
  }
  return sameLink ? {} : { spotify_link: fallback };
}
