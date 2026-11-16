export interface StoredMedia {
  body: ReadableStream<Uint8Array>;
  size: number;
  httpEtag: string;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
  blob(): Promise<Blob>;
}

export interface MediaBucket {
  get(key: string): Promise<StoredMedia | null>;
  head(key: string): Promise<Omit<StoredMedia, 'body' | 'blob'> | null>;
  put(
    key: string,
    bytes: ArrayBuffer | ArrayBufferView,
    options: { onlyIf?: { etagDoesNotMatch: string }; httpMetadata: { contentType: string } },
  ): Promise<unknown>;
  delete(keys: string[]): Promise<void>;
}

export function getMediaBucket(): MediaBucket | undefined {
  return undefined;
}
