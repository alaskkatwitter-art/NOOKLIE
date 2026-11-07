import { feedImageTypes, feedVideoTypes, maxFeedUploadBytes } from '@/lib/social/attachments';

export const chapterBannerTypes = [...feedImageTypes, ...feedVideoTypes];
export const maxChapterBannerBytes = maxFeedUploadBytes;
const videoIdPattern = /^[a-zA-Z0-9_-]{11}$/;

export function youtubeBannerId(value: string): string | null {
  const url = URL.parse(value.trim());
  if (url?.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const path = url.pathname.replace(/\/$/, '').split('/').slice(1);
  let id: string | null = null;
  if (url.hostname === 'youtu.be' && path.length === 1) id = path[0];
  else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (path.length === 2 && ['shorts', 'embed', 'live'].includes(path[0])) id = path[1];
  }
  return id && videoIdPattern.test(id) ? id : null;
}

export function isUploadedBannerVideo(value: string): boolean {
  const path = URL.parse(value)?.pathname ?? '';
  return /^\/storage\/v1\/object\/public\/chapter-media\/.+\/banner-[\da-f-]+\.(mp4|webm)$/i.test(path);
}
