import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_ITEM_LENGTH, MAX_PACK_ITEMS } from './types';
import { isRoomPack } from './validate';

const pack = (items: { id: string; text: string }[]) => ({ id: 'p', name: 'P', description: '', free: true, minAge: 0, items });
const numbered = (n: number, text = 'Thing') => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, text }));

describe('isRoomPack', () => {
  it('takes lists up to the item and length caps', () => {
    expect(isRoomPack(pack(numbered(MAX_PACK_ITEMS, 'x'.repeat(MAX_ITEM_LENGTH))))).toBe(true);
    expect(isRoomPack(pack(numbered(MAX_PACK_ITEMS + 1)))).toBe(false);
    expect(isRoomPack(pack(numbered(1, 'x'.repeat(MAX_ITEM_LENGTH + 1))))).toBe(false);
  });

  it('accepts every committed pack, so any of them can host a trip', () => {
    const dir = new URL('../packs/', import.meta.url);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
      expect(isRoomPack(JSON.parse(readFileSync(new URL(file, dir), 'utf8'))), file).toBe(true);
    }
  });
});
