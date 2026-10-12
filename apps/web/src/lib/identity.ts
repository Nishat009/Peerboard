export type LocalUser = { name: string; color: string };

const STORAGE_KEY = 'peerboard:user';

/** Distinct, AA-contrast-on-white hues for cursors and avatars. */
export const USER_COLORS = [
  '#2c4cd9',
  '#0f766e',
  '#b45309',
  '#be123c',
  '#7c3aed',
  '#0369a1',
  '#4d7c0f',
  '#c2410c',
] as const;

const ADJECTIVES = ['Brave', 'Calm', 'Clever', 'Swift', 'Quiet', 'Bright', 'Bold', 'Kind'];
const ANIMALS = ['Otter', 'Falcon', 'Lynx', 'Heron', 'Panda', 'Fox', 'Koala', 'Orca'];

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]!;

export function randomUser(): LocalUser {
  return { name: `${pick(ADJECTIVES)} ${pick(ANIMALS)}`, color: pick(USER_COLORS) };
}

export function loadUser(): LocalUser {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as LocalUser | null;
    if (parsed && typeof parsed.name === 'string' && typeof parsed.color === 'string')
      return parsed;
  } catch {
    // Corrupt or blocked storage: fall through to a fresh identity.
  }
  const user = randomUser();
  saveUser(user);
  return user;
}

export function saveUser(user: LocalUser): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Storage may be unavailable (private mode); identity then lasts for this tab only.
  }
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
