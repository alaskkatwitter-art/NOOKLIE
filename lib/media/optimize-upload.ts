import sharp from 'sharp';

/**
 * Reduce image upload bandwidth without changing formats or touching existing media.
 * Animated GIFs and videos must retain their original bytes.
 */
export async function optimizeUploadedImage(buffer: Buffer, mimeType: string, maxDimension = 1600): Promise<Buffer> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) return buffer;
  try {
    const image = sharp(buffer, { failOn: 'error', limitInputPixels: 40_000_000 });
    const meta = await image.metadata();
    if (!meta.width || !meta.height || (meta.pages ?? 1) > 1) return buffer;
    let pipeline = image.rotate().resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true });
    if (mimeType === 'image/jpeg') pipeline = pipeline.jpeg({ quality: 80, mozjpeg: true });
    else if (mimeType === 'image/png') pipeline = pipeline.png({ compressionLevel: 9, palette: false });
    else pipeline = pipeline.webp({ quality: 80, effort: 4 });
    const optimized = await pipeline.toBuffer();
    return optimized.length < buffer.length ? optimized : buffer;
  } catch {
    // Never block an otherwise valid upload because optimization failed.
    return buffer;
  }
}
