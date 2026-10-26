import type { ListLength, Pack, PackItem } from '../shared/types';
import { BINGO_CELLS, LIST_LENGTH_COUNT } from '../shared/types';
import type { Rng } from './rng';
import { sample } from './rng';

/** Entitlement stub. Future billing replaces this one function. */
export function isPackUnlocked(_packId: string): boolean {
  return true;
}

/** Minimum items a pack needs for Bingo: 24 squares around the free center. */
export const BINGO_MIN_ITEMS = BINGO_CELLS - 1;

export function canPlayBingo(pack: Pick<Pack, 'items'>): boolean {
  return pack.items.length >= BINGO_MIN_ITEMS;
}

export function canPlaySpotIt(pack: Pick<Pack, 'items'>): boolean {
  return pack.items.length >= 1;
}

/** Draw the items for a Called It game. "long" uses every item in the pack. */
export function drawItems(items: readonly PackItem[], length: ListLength, rng: Rng): PackItem[] {
  const count = LIST_LENGTH_COUNT[length];
  if (count === 'all') return sample(items, items.length, rng);
  return sample(items, count, rng);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Turn a block of user-typed lines into pack items. Blank lines and exact
 * duplicates are dropped; ids are made unique with a numeric suffix.
 */
export function itemsFromLines(lines: string): PackItem[] {
  const seen = new Map<string, number>();
  const texts = new Set<string>();
  const items: PackItem[] = [];
  for (const raw of lines.split(/\r?\n/)) {
    const text = raw.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (texts.has(key)) continue;
    texts.add(key);
    const base = slugify(text) || 'item';
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    items.push({ id: n === 0 ? base : `${base}-${n + 1}`, text });
  }
  return items;
}
