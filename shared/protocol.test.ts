import { describe, expect, it } from 'vitest';
import { isClientMessage } from './protocol';

const settings = { mode: 'spotit', listLength: 'quick', pattern: 'line', approvals: 'auto' };
const pack = { id: 'p', name: 'P', description: '', free: true, minAge: 0, items: [{ id: 'a', text: 'A' }] };

describe('isClientMessage', () => {
  it('accepts every well-formed action', () => {
    for (const m of [
      { type: 'join', name: 'Kid', seq: 0 },
      { type: 'start', seq: 1 },
      { type: 'claim', itemId: 'a', seq: 2 },
      { type: 'reassign', itemId: 'a', playerId: 'p1', seq: 3 },
      { type: 'mark', cell: 24, seq: 4 },
      { type: 'settings', settings, seq: 5 },
      { type: 'newRound', settings, pack, seq: 6 },
    ]) {
      expect(isClientMessage(m)).toBe(true);
    }
  });

  it('rejects unknown types and missing or malformed fields', () => {
    for (const m of [
      null,
      { type: 'claim', itemId: 'a' },
      { type: 'explode', seq: 1 },
      { type: 'claim', seq: 1 },
      { type: 'reassign', itemId: 'a', seq: 1 },
      { type: 'mark', cell: 25, seq: 1 },
      { type: 'mark', cell: 1.5, seq: 1 },
      { type: 'settings', settings: {}, seq: 1 },
      { type: 'settings', settings: { ...settings, listLength: 'x' }, seq: 1 },
      { type: 'newRound', settings, pack: { ...pack, items: [] }, seq: 1 },
      { type: 'newRound', settings, pack: { ...pack, items: [{ id: 'a', text: 'A', emoji: {} }] }, seq: 1 },
      { type: 'newRound', settings, pack: { ...pack, items: [{ id: 'a', text: 'A' }, { id: 'a', text: 'B' }] }, seq: 1 },
    ]) {
      expect(isClientMessage(m)).toBe(false);
    }
  });
});
