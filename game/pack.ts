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

/** How many items a Called It game of this length draws from a pack of `total`. */
export function listItemCount(total: number, length: ListLength): number {
  const n = LIST_LENGTH_COUNT[length];
  return n === 'all' ? total : Math.min(n, total);
}

/** Draw the items for a Called It game. "long" uses every item in the pack. */
export function drawItems(items: readonly PackItem[], length: ListLength, rng: Rng): PackItem[] {
  return sample(items, listItemCount(items.length, length), rng);
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
  const ids = new Set<string>();
  const texts = new Set<string>();
  const items: PackItem[] = [];
  for (const raw of lines.split(/\r?\n/)) {
    const text = raw.trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (texts.has(key)) continue;
    texts.add(key);
    const base = slugify(text) || 'item';
    // Bump until free: "a b 2" slugs to a suffixed id itself, so counting per base is not enough.
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    items.push({ id, text });
  }
  return items;
}
