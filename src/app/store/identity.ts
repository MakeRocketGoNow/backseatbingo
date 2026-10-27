import { createLocalStore } from './localStore';

const TOKEN_KEY = 'bb:playerToken';
let sessionToken: string | null = null;

/** 32 hex characters. Works in insecure contexts too (a LAN address in development). */
function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The device's player token. It identifies this device inside any room it
 * joins and lets it reconnect after the phone sleeps. Never shown to anyone.
 */
export function getPlayerToken(): string {
  try {
    const existing = localStorage.getItem(TOKEN_KEY);
    if (existing && existing.length >= 16) return existing;
    const fresh = randomToken();
    localStorage.setItem(TOKEN_KEY, fresh);
    return fresh;
  } catch {
    sessionToken ??= randomToken();
    return sessionToken;
  }
}

export const displayNameStore = createLocalStore<string>('bb:displayName', '', (v): v is string => typeof v === 'string');
export const useDisplayName = displayNameStore.use;
