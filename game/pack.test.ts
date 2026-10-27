import { describe, expect, it } from 'vitest';
import type { PackItem } from '../shared/types';
import { canPlayBingo, drawItems, isPackUnlocked, itemsFromLines, listItemCount, slugify } from './pack';
import { seededRng } from './rng';

const items: PackItem[] = Array.from({ length: 40 }, (_, i) => ({ id: `i${i}`, text: `Item ${i}` }));

describe('packs', () => {
  it('every pack is unlocked in v1', () => {
    expect(isPackUnlocked('family')).toBe(true);
    expect(isPackUnlocked('anything')).toBe(true);
  });

  it('draws quick, normal and long lists without duplicates', () => {
    const quick = drawItems(items, 'quick', seededRng(1));
    const normal = drawItems(items, 'normal', seededRng(1));
    const long = drawItems(items, 'long', seededRng(1));
    expect(quick).toHaveLength(15);
    expect(normal).toHaveLength(30);
    expect(long).toHaveLength(40);
    expect(new Set(long.map((i) => i.id)).size).toBe(40);
  });

  it('counts list items, capped by the pack size', () => {
    expect(listItemCount(100, 'quick')).toBe(15);
    expect(listItemCount(10, 'normal')).toBe(10);
    expect(listItemCount(42, 'long')).toBe(42);
  });

  it('a short pack just uses everything', () => {
    expect(drawItems(items.slice(0, 5), 'normal', seededRng(1))).toHaveLength(5);
  });

  it('bingo needs 24 items', () => {
    expect(canPlayBingo({ items: items.slice(0, 24) })).toBe(true);
    expect(canPlayBingo({ items: items.slice(0, 23) })).toBe(false);
  });

  it('slugify and itemsFromLines make stable unique ids', () => {
    expect(slugify('A billboard for a personal injury lawyer!')).toBe('a-billboard-for-a-personal-injury-lawyer');
    expect(slugify('  Café  ')).toBe('cafe');
    const parsed = itemsFromLines('Red barn\n\n  red barn \nRed barn!\nGreen tractor\n');
    expect(parsed).toEqual([
      { id: 'red-barn', text: 'Red barn' },
      { id: 'red-barn-2', text: 'Red barn!' },
      { id: 'green-tractor', text: 'Green tractor' },
    ]);
    const tricky = itemsFromLines('a b\na b!\na b 2');
    expect(new Set(tricky.map((i) => i.id)).size).toBe(3);
  });
});
