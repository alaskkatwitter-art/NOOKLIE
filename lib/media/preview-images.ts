import { getHistoricalMediaBucket, getMediaBucket } from '@/lib/media/r2-binding';

export function previewImageStorage(bucket: 'chapter-media' | 'group-avatars') {
  const primary = getMediaBucket();
  const key = (path: string) => bucket + '/' + path;
  return {
    async download(path: string) {
      const object = await primary?.get(key(path)) ?? await getHistoricalMediaBucket()?.get(key(path));
      return { data: await object?.blob() ?? null, error: null };
    },
    async upload(path: string, bytes: Uint8Array, options: {contentType: string; upsert: false}) {
      const result = await primary?.put(key(path),bytes,{
        onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:options.contentType},
      });
      if (!result) throw Error('Unable to store preview image');
      return {error:null};
    },
    async remove(paths: string[]) {
      await primary?.delete(paths.map(key));
      return {error:null};
    },
  };
}
