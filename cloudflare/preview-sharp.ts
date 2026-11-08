// The media route catches thumbnail errors and sends the authorized original.
// Workers cannot load Sharp's native addon, so use that fallback in this preview.
export default function sharp(): never {
  throw new Error('Native thumbnail generation is unavailable in this Workers preview.');
}
