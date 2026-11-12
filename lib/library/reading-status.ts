export const readingStatuses = {
  unread: 'Quero ler',
  reading: 'Lendo',
  completed: 'Já li',
} as const;

export type ReadingStatus = keyof typeof readingStatuses;

export function isReadingStatus(value: unknown): value is ReadingStatus {
  return typeof value === 'string' && Object.hasOwn(readingStatuses, value);
}
