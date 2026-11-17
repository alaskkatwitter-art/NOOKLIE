import { profileGifLimits, profileImageLimits, type ProfileImageKind } from './animation';

const standardTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;

const inputTypes = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
} as const;

export const profilePhotoAccept = 'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif';

export function profilePhotoType(file: Blob) {
  if (/^image\/hei[cf]-sequence$/.test(file.type)) {
    return file.type.replace('-sequence', '');
  }
  if (file.type && file.type !== 'application/octet-stream') return file.type;
  const name = 'name' in file && typeof file.name === 'string' ? file.name : '';
  const extension = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase();
  return extension && Object.hasOwn(inputTypes, extension) ? inputTypes[extension as keyof typeof inputTypes] : '';
}

export function profilePhotoError(file: Blob, kind: ProfileImageKind, allowGif: boolean) {
  const type = profilePhotoType(file);
  if (allowGif && type === 'image/gif') {
    const limit = profileGifLimits[kind];
    return file.size > limit.bytes ? `Use um GIF de até ${limit.label}.` : null;
  }
  if (!Object.hasOwn(standardTypes, type) && type !== 'image/heic' && type !== 'image/heif') {
    return allowGif ? 'Escolha uma imagem JPG, PNG, WebP, HEIC, HEIF ou GIF.' : 'Escolha uma imagem JPG, PNG, WebP, HEIC ou HEIF.';
  }
  return file.size > 20 * 1024 * 1024 ? 'Escolha uma imagem de até 20 MB.' : null;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));
}

export async function exportProfilePhoto(canvas: HTMLCanvasElement, kind: ProfileImageKind, animated: boolean) {
  const limits = profileImageLimits[kind];
  const maxBytes = animated ? limits.previewBytes : limits.maxBytes;
  const attempts = [
    ['image/webp', animated ? 0.78 : 0.9],
    ['image/jpeg', 0.78],
    ['image/jpeg', 0.6],
  ] as const;

  for (const [type, quality] of attempts) {
    const blob = await canvasBlob(canvas, type, quality);
    if (blob && blob.size > 0 && blob.size <= maxBytes && Object.hasOwn(standardTypes, blob.type)) {
      const extension = standardTypes[blob.type as keyof typeof standardTypes];
      return new File([blob], `${kind}.${extension}`, { type: blob.type });
    }
  }
  throw new Error('Não foi possível preparar a imagem. Tente escolher outra foto.');
}
