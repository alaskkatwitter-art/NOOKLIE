export function favoriteFandoms(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 30 || value.some(v => typeof v !== 'string' || !v.trim() || v.trim().length > 100)) return null;
  return [...new Map(value.map((v: string) => [v.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), v.trim()])).values()];
}
