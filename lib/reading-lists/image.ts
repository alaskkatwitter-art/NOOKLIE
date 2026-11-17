export function readingListImageUrl(id: string, imagePath?: string | null) {
  return imagePath ? '/api/reading-lists/' + encodeURIComponent(id) + '/image?v=' +
    encodeURIComponent(imagePath.split('/').pop() || '') : null;
}
