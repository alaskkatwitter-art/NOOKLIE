export type ProfileImageKind = 'avatar' | 'cover';

export type ImageFraming = { zoom: number; x: number; y: number };
export type ProfileAnimation = ImageFraming & { url: string };

export const defaultImageFraming: ImageFraming = { zoom: 1, x: 50, y: 50 };
export const profileGifLimits = {
  avatar: { bytes: 500_000, label: '500 KB', side: 512, framePixels: 16_000_000 },
  cover: { bytes: 2_000_000, label: '2 MB', side: 1600, framePixels: 40_000_000 },
};

export function parseImageFraming(value: unknown): ImageFraming | null {
  if (!value || typeof value !== 'object') return null;
  const { zoom, x, y } = value as Record<string, unknown>;
  if (typeof zoom !== 'number' || !Number.isFinite(zoom) || zoom < 1 || zoom > 3) return null;
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 100) return null;
  if (typeof y !== 'number' || !Number.isFinite(y) || y < 0 || y > 100) return null;
  return { zoom, x, y };
}

// Bound the decoded animation work without decoding image pixels on the Worker.
export function validateProfileGif(bytes: Uint8Array, kind: ProfileImageKind): string | null {
  const limit = profileGifLimits[kind];
  if (bytes.length > limit.bytes) return `Use um GIF de até ${limit.label}.`;
  const invalid = 'O arquivo GIF está incompleto ou inválido.';
  const signature = String.fromCharCode(...bytes.subarray(0, 6));
  if (bytes.length < 14 || (signature !== 'GIF87a' && signature !== 'GIF89a')) return invalid;

  const word = (index: number) => bytes[index] + 256 * bytes[index + 1];
  const colorTableSize = (flags: number) => flags & 0x80 ? 3 * (2 << (flags & 7)) : 0;
  const width = word(6), height = word(8);
  if (!width || !height) return invalid;
  if (Math.max(width, height) > limit.side || width * height > (kind === 'cover' ? 960_000 : 262_144)) {
    return `Reduza a resolução do GIF. O maior lado pode ter até ${limit.side} pixels.`;
  }

  let cursor = 13 + colorTableSize(bytes[10]);
  let frames = 0, duration = 0, delay = 10;
  const skipSubBlocks = () => {
    while (cursor < bytes.length) {
      const length = bytes[cursor++];
      if (!length) return true;
      cursor += length;
    }
    return false;
  };

  while (cursor < bytes.length) {
    const block = bytes[cursor++];
    if (block === 0x3b) return frames && cursor === bytes.length ? null : invalid;
    if (block === 0x21) {
      const label = bytes[cursor++];
      if (label === 0xf9) {
        if (bytes[cursor] !== 4 || bytes[cursor + 5] !== 0) return invalid;
        delay = word(cursor + 2);
      }
      if (!skipSubBlocks()) return invalid;
      continue;
    }
    if (block !== 0x2c || cursor + 10 > bytes.length) return invalid;

    const left = word(cursor), top = word(cursor + 2);
    const frameWidth = word(cursor + 4), frameHeight = word(cursor + 6);
    if (!frameWidth || !frameHeight || left + frameWidth > width || top + frameHeight > height) return invalid;
    cursor += 9 + colorTableSize(bytes[cursor + 8]);
    const codeSize = bytes[cursor++];
    if (codeSize < 2 || codeSize > 8 || !bytes[cursor] || !skipSubBlocks()) return invalid;

    frames += 1;
    duration += delay <= 1 ? 10 : delay;
    delay = 10;
    if (frames > 100 || frames * width * height > limit.framePixels || duration > 1200) {
      return 'Escolha um GIF mais curto ou com menos quadros.';
    }
  }
  return invalid;
}
