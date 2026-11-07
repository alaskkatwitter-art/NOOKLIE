export function notificationHref(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(value)) return null;
  try {
    const url = new URL(value, 'https://nooklie.vercel.app');
    return url.origin === 'https://nooklie.vercel.app' ? url.pathname + url.search + url.hash : null;
  } catch { return null; }
}

export const notificationReturnParam = 'origem';
export const notificationsPath = '/notificacoes';

export function notificationDestination(value: unknown): string | null {
  const href = notificationHref(value);
  if (!href) return null;
  const url = new URL(href, 'https://nooklie.vercel.app');
  if (url.pathname !== notificationsPath) url.searchParams.set(notificationReturnParam, 'notificacoes');
  return url.pathname + url.search + url.hash;
}
