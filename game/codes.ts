import type { Rng } from './rng';

/** Uppercase letters minus the ambiguous I and O. Digits are excluded entirely. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const CODE_LENGTH = 4;

export function generateRoomCode(rng: Rng): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  }
  return code;
}

/** Uppercases and maps the characters people confuse for letters we do not use. */
export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/0/g, 'O')
    .replace(/1/g, 'I')
    .replace(/O/g, 'Q')
    .replace(/I/g, 'J')
    .slice(0, CODE_LENGTH);
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}
