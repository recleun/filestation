const CLIENT_ID_KEY = 'filestation.clientId';
const CLIENT_NAME_KEY = 'filestation.clientName';
export const MAX_NAME_LENGTH = 64;

const ADJECTIVES = [
  'swift',
  'quiet',
  'bold',
  'lucky',
  'clever',
  'brave',
  'cosmic',
  'amber',
  'royal',
  'silent',
] as const;

const NOUNS = [
  'otter',
  'falcon',
  'tiger',
  'panda',
  'comet',
  'maple',
  'raven',
  'lynx',
  'cedar',
  'phoenix',
] as const;

function pick<T>(items: readonly T[]): T {
  const index = Math.floor(Math.random() * items.length);
  return items[index] ?? items[0]!;
}

export function generateUuid(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 8).join(''),
    hex.slice(8, 12).join(''),
    hex.slice(12, 16).join(''),
    hex.slice(16).join(''),
  ].join('-');
}

function randomDisplayName(): string {
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}`;
}

export function loadClientId(): string {
  const existing = localStorage.getItem(CLIENT_ID_KEY);
  if (existing !== null) {
    return existing;
  }
  const created = generateUuid();
  localStorage.setItem(CLIENT_ID_KEY, created);
  return created;
}

export function loadClientName(): string {
  const existing = localStorage.getItem(CLIENT_NAME_KEY);
  if (existing !== null) {
    return existing;
  }
  return saveClientName(randomDisplayName());
}

export function saveClientName(raw: string): string {
  const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH);
  const finalName = cleaned.length > 0 ? cleaned : randomDisplayName();
  localStorage.setItem(CLIENT_NAME_KEY, finalName);
  return finalName;
}
