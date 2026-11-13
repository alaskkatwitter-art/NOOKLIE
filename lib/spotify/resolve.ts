import { NextResponse } from 'next/server';
import { parseSpotifyUrl, spotifyImage, type SpotifyLink } from './link';

async function resolveSharedLink(value: unknown, playlistOnly: boolean) {
  const direct = parseSpotifyUrl(value, playlistOnly);
  if (direct || typeof value !== 'string' || value.length > 512) return direct;

  const shortLink = value.trim().match(/^https:\/\/(?:spotify\.link|spoti\.fi)\/[A-Za-z0-9_-]+(?:\?[^#]*)?$/i);
  if (!shortLink) return null;
  const response = await fetch(shortLink[0], { signal: AbortSignal.timeout(4000), redirect: 'manual' });
  const location = response.headers.get('location');
  return response.status >= 300 && response.status < 400 ? parseSpotifyUrl(location, playlistOnly) : null;
}

export async function spotifyUpdate(
  value: unknown, existing?: SpotifyLink | null, playlistOnly = false,
): Promise<{ spotify_link?: SpotifyLink | null } | NextResponse> {
  if (value === undefined) return {};
  if (value === null || (typeof value === 'string' && !value.trim())) return { spotify_link: null };

  let parsed: ReturnType<typeof parseSpotifyUrl>;
  try {
    parsed = await resolveSharedLink(value, playlistOnly);
  } catch {
    return NextResponse.json({
      error: 'Não consegui abrir o link encurtado. Cole o endereço completo de open.spotify.com.',
    }, { status: 400 });
  }
  if (!parsed) return NextResponse.json({
    error: playlistOnly ? 'Cole o link de uma playlist do Spotify.' : 'Cole o link de uma música, álbum ou playlist do Spotify.',
  }, { status: 400 });

  const fallback = { url: parsed.url, title: parsed.label, image: null };
  const sameLink = existing?.url === parsed.url;
  if (sameLink && (existing.title !== fallback.title || existing.image)) return {};
  const endpoint = new URL('https://open.spotify.com/oembed');
  endpoint.searchParams.set('url', parsed.url);
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(4000), redirect: 'error' });
    if (response.ok) {
      const data = await response.json();
      const title = typeof data?.title === 'string' ? data.title.trim().slice(0, 300) : '';
      if (title) return { spotify_link: { url: parsed.url, title, image: spotifyImage(data.thumbnail_url) } };
    }
  } catch {
    // A valid link remains usable when Spotify's preview endpoint is unavailable.
  }
  return sameLink ? {} : { spotify_link: fallback };
}
