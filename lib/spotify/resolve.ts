import { NextResponse } from 'next/server';
import { parseSpotifyUrl, spotifyImage, type SpotifyLink } from './link';

export async function spotifyUpdate(
  value: unknown, existing?: SpotifyLink | null, playlistOnly = false,
): Promise<{ spotify_link?: SpotifyLink | null } | NextResponse> {
  if (value === undefined) return {};
  if (value === null || (typeof value === 'string' && !value.trim())) return { spotify_link: null };

  const parsed = parseSpotifyUrl(value, playlistOnly);
  if (!parsed) return NextResponse.json({
    error: playlistOnly ? 'Cole o link de uma playlist de open.spotify.com.' : 'Cole o link de uma música, álbum ou playlist de open.spotify.com.',
  }, { status: 400 });

  if (existing?.url === parsed.url) return {};
  const endpoint = new URL('https://open.spotify.com/oembed');
  endpoint.searchParams.set('url', parsed.url);
  try {
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(4000), redirect: 'error' });
    if (response.status === 404) return NextResponse.json({
      error: 'O Spotify não encontrou esse conteúdo. Confira se o link está correto e pode ser aberto por outras pessoas.',
    }, { status: 400 });
    if (!response.ok) throw new Error('Spotify unavailable');
    const data = await response.json();
    const title = typeof data?.title === 'string' ? data.title.trim().slice(0, 300) : '';
    if (!title) throw new Error('Spotify metadata missing');
    return { spotify_link: { url: parsed.url, title, image: spotifyImage(data.thumbnail_url) } };
  } catch {
    return NextResponse.json({
      error: 'Não foi possível carregar a prévia do Spotify agora. Tente novamente.',
    }, { status: 503 });
  }
}
