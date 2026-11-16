export const eventTextLimit = 12_000;
export const eventTopicLimit = 4_000;
export const eventMaxTopics = 4;
export const eventMaxImages = 3;
export const eventImageBytes = 3 * 1024 * 1024;
export const eventDataBytes = 400_000;

export const eventFormats = ['Mostra literária', 'Concurso literário', 'Desafio de escrita', 'Maratona de leitura', 'Evento colaborativo', 'Outro'];
export const eventEligibility = ['Obras existentes ou inéditas', 'Somente obras já publicadas', 'Somente obras inéditas'];
export const eventEntryLimits = ['Ilimitadas', 'Uma obra', 'Duas obras', 'Três obras', 'Cinco obras'];

export const eventImageTypes: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export type EventImage = { id: string; type: string; alt: string };
export type EventTopic = { title: string; text: string };
export type EventDetails = {
  format: string;
  eligibility: string;
  entry_limit: string;
  instructions: string;
  rules: string;
  topics: EventTopic[];
  images: EventImage[];
};

export type LiteraryEvent = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  active: boolean;
  details: EventDetails | null;
  revision: string;
};

export function eventContent(event?: LiteraryEvent) {
  const defaults: EventDetails = {
    format: '', eligibility: '', entry_limit: '', instructions: '', rules: '', topics: [], images: [],
  };
  const description = event?.description ?? '';
  if (event?.details) return { description, ...event.details };
  // Events created by the previous editor saved their fields in a single text column.
  const lines = description.replaceAll('\\n', '\n').split('\n\n');
  const first = lines.findIndex(line => eventFormats.some(format => line === 'Formato: ' + format));
  if (first <= 0 || !lines[first + 1]?.startsWith('Participação: ') ||
      !lines[first + 2]?.startsWith('Inscrições por autor: ')) {
    return { description, ...defaults };
  }
  const eligibility = lines[first + 1].slice('Participação: '.length);
  const entry_limit = lines[first + 2].slice('Inscrições por autor: '.length);
  const tail = lines.slice(first + 3).join('\n\n');
  const sections = /^(?:Como participar:\n([\s\S]*?)\n\n)?Regras:(?:\n([\s\S]*))?$/.exec(tail);
  if (!eventEligibility.includes(eligibility) || !eventEntryLimits.includes(entry_limit) || !sections) {
    return { description, ...defaults };
  }
  return {
    ...defaults,
    description: lines.slice(0, first).join('\n\n'),
    format: lines[first].slice('Formato: '.length),
    eligibility,
    entry_limit,
    instructions: sections[1] ?? '',
    rules: sections[2] ?? '',
  };
}

export function eventImageUrl(eventId: string, image: EventImage) {
  return '/api/events?event=' + eventId + '&image=' + image.id;
}
