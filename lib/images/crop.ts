export function cropRect(width: number, height: number, aspect: number, zoom: number, x: number, y: number) {
  if (![width, height, aspect, zoom, x, y].every(Number.isFinite) || width <= 0 || height <= 0 || aspect <= 0) throw new Error('Imagem inválida.');
  const scale = Math.max(1 / width, 1 / (aspect * height)) * Math.max(1, Math.min(3, zoom));
  const cropWidth = 1 / scale, cropHeight = 1 / (aspect * scale);
  return { sx: (width - cropWidth) * Math.max(0, Math.min(100, x)) / 100,
    sy: (height - cropHeight) * Math.max(0, Math.min(100, y)) / 100, sw: cropWidth, sh: cropHeight };
}
