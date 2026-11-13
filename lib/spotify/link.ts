const labels = { track: 'Música', album: 'Álbum', playlist: 'Playlist' } as const;
export type SpotifyKind = keyof typeof labels;
export type SpotifyLink = { url: string; title: string; image: string | null };

export function parseSpotifyUrl(value: unknown, playlistOnly = false) {
  if (typeof value !== 'string' || value.length > 512) return null;
  try {
    const url = new URL(value.trim());
    if (url.origin !== 'https://open.spotify.com' || url.username || url.password) return null;
    const match = url.pathname.match(/^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(track|album|playlist)\/([A-Za-z0-9]{22})\/?$/i);
    if (!match) return null;
    const kind = match[1].toLowerCase() as SpotifyKind;
    if (playlistOnly && kind !== 'playlist') return null;
    return { url: `https://open.spotify.com/${kind}/${match[2]}`, kind, label: labels[kind] };
  } catch {
    return null;
  }
}

export function spotifyImage(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 512) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password &&
      ['i.scdn.co', 'image-cdn-ak.spotifycdn.com', 'image-cdn-fa.spotifycdn.com', 'mosaic.scdn.co'].includes(url.hostname)
      ? url.href : null;
  } catch {
    return null;
  }
}
