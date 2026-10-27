import { useSyncExternalStore } from 'react';

/**
 * Tiny localStorage-backed store with a React hook. Used for small bits of
 * device state (settings, last setup, the in-progress local game). Reads and
 * writes are wrapped because storage can be unavailable in private windows.
 */
export function createLocalStore<T>(key: string, fallback: T, validate: (v: unknown) => v is T) {
  const listeners = new Set<() => void>();
  let cached: T | undefined;

  function read(): T {
    if (cached !== undefined) return cached;
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        if (validate(parsed)) {
          cached = parsed;
          return parsed;
        }
      }
    } catch {
      // fall through to the default
    }
    cached = fallback;
    return fallback;
  }

  function write(value: T) {
    cached = value;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage unavailable; keep the in-memory value
    }
    listeners.forEach((l) => l());
  }

  function subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  }

  function use(): [T, (next: T | ((prev: T) => T)) => void] {
    const value = useSyncExternalStore(subscribe, read, () => fallback);
    return [value, (next) => write(typeof next === 'function' ? (next as (p: T) => T)(read()) : next)];
  }

  return { read, write, use, subscribe };
}

export { isRecord } from '@shared/validate';
