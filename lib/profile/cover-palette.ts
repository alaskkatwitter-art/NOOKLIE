type Color = [number, number, number];

/** A small, quantized sample avoids letting individual highlights dominate. */
export function coverPalette(pixels: ArrayLike<number>): [Color, Color] | null {
  const buckets = new Map<string, { count: number; weight: number; sum: Color }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const [r, g, b, alpha] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
    if (alpha < 192) continue;
    const high = Math.max(r, g, b), low = Math.min(r, g, b);
    if (high < 28 || low > 232) continue;
    const key = [r, g, b].map(channel => Math.floor(channel / 32)).join(',');
    const bucket = buckets.get(key) || { count: 0, weight: 0, sum: [0, 0, 0] };
    bucket.count++;
    bucket.weight += 1 + (high - low) / 255;
    bucket.sum[0] += r; bucket.sum[1] += g; bucket.sum[2] += b;
    buckets.set(key, bucket);
  }
  const colors = [...buckets.values()].sort((a, b) => b.weight - a.weight)
    .map(bucket => bucket.sum.map(channel => Math.round(channel / bucket.count)) as Color);
  if (!colors.length) return null;
  const first = colors[0];
  const second = colors.find(color => color.reduce((distance, channel, i) => distance + (channel - first[i]) ** 2, 0) > 80 ** 2) || first;
  return [first, second];
}
