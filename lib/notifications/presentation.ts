export function notificationHref(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, 'https://toriland.vercel.app');
    return url.origin === 'https://toriland.vercel.app' ? url.pathname + url.search + url.hash : null;
  } catch { return null; }
}
