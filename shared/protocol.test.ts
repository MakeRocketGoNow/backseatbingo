import { describe, expect, it } from 'vitest';
import { isClientMessage, isSupportedClient, PROTOCOL_VERSION } from './protocol';

const settings = { mode: 'spotit', listLength: 'quick', pattern: 'line', approvals: 'auto' };
const pack = { id: 'p', name: 'P', description: '', free: true, minAge: 0, items: [{ id: 'a', text: 'A' }] };

describe('isClientMessage', () => {
  it('accepts every well-formed action', () => {
    for (const m of [
      { type: 'join', name: 'Kid', seq: 0 },
      { type: 'start', seq: 1 },
      { type: 'claim', itemId: 'a', seq: 2 },
      { type: 'reassign', itemId: 'a', from: 'p1', to: 'p2', seq: 3 },
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
      { type: 'reassign', itemId: 'a', playerId: 'p1', seq: 1 },
      { type: 'unclaim', itemId: 'a', seq: 1 },
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

describe('isSupportedClient', () => {
  it('treats a client that sends no version as version 1', () => {
    expect(isSupportedClient(null, 1)).toBe(true);
    expect(isSupportedClient(null, 2)).toBe(false);
  });

  it('accepts the minimum and anything newer', () => {
    expect(isSupportedClient('2', 2)).toBe(true);
    expect(isSupportedClient('3', 2)).toBe(true);
    expect(isSupportedClient('1', 2)).toBe(false);
  });

  it('turns away a version it cannot read', () => {
    expect(isSupportedClient('', 1)).toBe(false);
    expect(isSupportedClient('abc', 1)).toBe(false);
    expect(isSupportedClient('1.5', 1)).toBe(false);
  });

  it('accepts the current build', () => {
    expect(isSupportedClient(String(PROTOCOL_VERSION))).toBe(true);
  });
});
