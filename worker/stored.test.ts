import { describe, expect, it } from 'vitest';
import type { RoomState } from '../shared/types';
import { forgetDeparted, forgetLeaver, isMember, upgradeStored, type Stored } from './stored';

function stored(gamePlayers: string[] | null): Stored {
  const room = {
    players: [
      { id: 'h', name: 'Host', connected: true, joinedAt: 0 },
      { id: 'g1', name: 'Kid', connected: true, joinedAt: 0 },
    ],
    game: gamePlayers && { mode: 'spotit', status: 'playing', players: gamePlayers.map((id) => ({ id, name: id })), items: [], claims: {} },
  } as unknown as RoomState;
  return {
    room,
    tokens: { th: 'h', tg1: 'g1', tg2: 'g2' },
    applied: { tg1: { session: 's', seq: 3 }, tg2: { session: 's', seq: 5 } },
  };
}

describe('rooms stored by an older build', () => {
  it('upgrades the game shape and returns the same object otherwise', () => {
    const s = stored(['h', 'g1']);
    expect(upgradeStored(s)).toBe(s);
    const noGame = stored(null);
    expect(upgradeStored(noGame)).toBe(noGame);
    const old = stored(['h']);
    const game = old.room.game;
    if (game?.mode !== 'spotit') throw new Error('mode');
    (game as unknown as { claims: unknown }).claims = { a: { itemId: 'a', playerId: 'h', at: 1, status: 'claimed' } };
    const up = upgradeStored(old);
    expect(up).not.toBe(old);
    expect(up.room.game?.mode === 'spotit' && up.room.game.claims['a']).toHaveLength(1);
    expect(up.tokens).toBe(old.tokens);
  });
});

describe('room token bookkeeping', () => {
  it('counts only players in the room as members', () => {
    const s = stored(null);
    expect(isMember(s, 'tg1')).toBe(true);
    // g2 has a token but is not in the room (they left).
    expect(isMember(s, 'tg2')).toBe(false);
    expect(isMember(s, 'nope')).toBe(false);
  });

  it('forgets a leaver at once when no game lists them', () => {
    const s = forgetLeaver(stored(null), 'tg2', 'g2');
    expect(s.tokens).toEqual({ th: 'h', tg1: 'g1' });
    expect(s.applied).toEqual({ tg1: { session: 's', seq: 3 } });
  });

  it('keeps a leaver the current game still lists, so they can come back', () => {
    const s = stored(['h', 'g1', 'g2']);
    expect(forgetLeaver(s, 'tg2', 'g2')).toBe(s);
  });

  it('forgets everyone not in the room when a new round starts', () => {
    const s = forgetDeparted(stored(['h', 'g1', 'g2']));
    expect(s.tokens).toEqual({ th: 'h', tg1: 'g1' });
    expect(s.applied).toEqual({ tg1: { session: 's', seq: 3 } });
  });
});
