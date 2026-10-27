import { describe, expect, it } from 'vitest';
import type { PackItem, Player } from '../shared/types';
import {
  addSpotItPlayer,
  approveClaim,
  claim,
  createSpotItGame,
  endSpotItGame,
  isExhausted,
  reassign,
  spotItStandings,
  unclaim,
} from './spotit';

const players: Player[] = [
  { id: 'p1', name: 'Mom' },
  { id: 'p2', name: 'Dad' },
  { id: 'p3', name: 'Kid' },
];
const items: PackItem[] = [
  { id: 'a', text: 'A' },
  { id: 'b', text: 'B' },
  { id: 'c', text: 'C' },
];

function fresh() {
  return createSpotItGame(players, items);
}

describe('Called It claims', () => {
  it('first claim wins and locks the item', () => {
    const r1 = claim(fresh(), 'a', 'p1', 1);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.state.claims['a']).toEqual({ itemId: 'a', playerId: 'p1', at: 1, status: 'claimed' });

    const r2 = claim(r1.state, 'a', 'p2', 2);
    expect(r2).toEqual({ ok: false, error: 'already-claimed' });
  });

  it('rejects unknown items and players', () => {
    expect(claim(fresh(), 'zzz', 'p1', 1)).toEqual({ ok: false, error: 'unknown-item' });
    expect(claim(fresh(), 'a', 'nobody', 1)).toEqual({ ok: false, error: 'unknown-player' });
  });

  it('does not mutate the previous state', () => {
    const s0 = fresh();
    claim(s0, 'a', 'p1', 1);
    expect(s0.claims).toEqual({});
  });

  it('undo returns the item to unclaimed', () => {
    const s1 = claim(fresh(), 'a', 'p1', 1);
    if (!s1.ok) throw new Error('claim failed');
    const s2 = unclaim(s1.state, 'a');
    expect(s2.ok).toBe(true);
    if (!s2.ok) return;
    expect(s2.state.claims['a']).toBeUndefined();
    const again = claim(s2.state, 'a', 'p2', 3);
    expect(again.ok).toBe(true);
  });

  it('undo on an unclaimed item is an error', () => {
    expect(unclaim(fresh(), 'a')).toEqual({ ok: false, error: 'not-claimed' });
  });

  it('reassign hands the claim to another player', () => {
    const s1 = claim(fresh(), 'a', 'p1', 1);
    if (!s1.ok) throw new Error('claim failed');
    const s2 = reassign(s1.state, 'a', 'p3', 5);
    expect(s2.ok).toBe(true);
    if (!s2.ok) return;
    expect(s2.state.claims['a']?.playerId).toBe('p3');
    expect(reassign(s2.state, 'b', 'p1', 6)).toEqual({ ok: false, error: 'not-claimed' });
    expect(reassign(s2.state, 'a', 'ghost', 6)).toEqual({ ok: false, error: 'unknown-player' });
  });

  it('ends automatically when the list is exhausted', () => {
    let s = fresh();
    for (const [i, item] of items.entries()) {
      const r = claim(s, item.id, players[i % players.length]!.id, i);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(isExhausted(s)).toBe(true);
    expect(s.status).toBe('ended');
    expect(s.endedAt).toBe(2);
    expect(claim(s, 'a', 'p1', 9)).toEqual({ ok: false, error: 'not-playing' });
  });

  it('host can end early and no further changes are accepted', () => {
    const s1 = claim(fresh(), 'a', 'p1', 1);
    if (!s1.ok) throw new Error('claim failed');
    const ended = endSpotItGame(s1.state, 10);
    expect(ended.status).toBe('ended');
    expect(claim(ended, 'b', 'p2', 11)).toEqual({ ok: false, error: 'not-playing' });
    expect(unclaim(ended, 'a')).toEqual({ ok: false, error: 'not-playing' });
    expect(endSpotItGame(ended, 99)).toBe(ended);
  });
});

describe('Called It scoring', () => {
  it('counts claims per player and sorts descending with shared ranks', () => {
    let s = fresh();
    for (const [item, who] of [
      ['a', 'p2'],
      ['b', 'p2'],
      ['c', 'p3'],
    ] as const) {
      const r = claim(s, item, who, 1);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    const standings = spotItStandings(s);
    expect(standings.map((x) => [x.player.id, x.score, x.rank])).toEqual([
      ['p2', 2, 1],
      ['p3', 1, 2],
      ['p1', 0, 3],
    ]);
  });

  it('ties share a rank and keep setup order', () => {
    const r1 = claim(fresh(), 'a', 'p3', 1);
    if (!r1.ok) throw new Error(r1.error);
    const r2 = claim(r1.state, 'b', 'p1', 2);
    if (!r2.ok) throw new Error(r2.error);
    const standings = spotItStandings(r2.state);
    expect(standings.map((x) => [x.player.id, x.score, x.rank])).toEqual([
      ['p1', 1, 1],
      ['p3', 1, 1],
      ['p2', 0, 3],
    ]);
  });
});

describe('Called It with host approvals', () => {
  it('a pending claim reserves the item but does not score', () => {
    const r1 = claim(fresh(), 'a', 'p1', 1, true);
    if (!r1.ok) throw new Error(r1.error);
    expect(r1.state.claims['a']?.status).toBe('pending');
    expect(spotItStandings(r1.state).find((s) => s.player.id === 'p1')?.score).toBe(0);
    expect(claim(r1.state, 'a', 'p2', 2)).toEqual({ ok: false, error: 'already-claimed' });
  });

  it('approve scores it and can end the game; reject frees it', () => {
    let s = fresh();
    for (const item of ['a', 'b', 'c']) {
      const r = claim(s, item, 'p1', 1, true);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(isExhausted(s)).toBe(false);
    const rej = unclaim(s, 'c');
    if (!rej.ok) throw new Error(rej.error);
    expect(rej.state.claims['c']).toBeUndefined();

    let t = s;
    for (const item of ['a', 'b', 'c']) {
      const r = approveClaim(t, item, 5);
      if (!r.ok) throw new Error(r.error);
      t = r.state;
    }
    expect(spotItStandings(t)[0]?.score).toBe(3);
    expect(t.status).toBe('ended');
    expect(approveClaim(fresh(), 'a', 1)).toEqual({ ok: false, error: 'not-claimed' });
  });

  it('approving an already approved claim is a no-op', () => {
    const r1 = claim(fresh(), 'a', 'p1', 1);
    if (!r1.ok) throw new Error(r1.error);
    const r2 = approveClaim(r1.state, 'a', 2);
    expect(r2.ok && r2.state).toBe(r1.state);
  });
});

describe('late joiners', () => {
  it('addSpotItPlayer is idempotent and lets the new player claim', () => {
    const s1 = addSpotItPlayer(fresh(), { id: 'p9', name: 'Late' });
    expect(s1.players).toHaveLength(4);
    expect(addSpotItPlayer(s1, { id: 'p9', name: 'Late' })).toBe(s1);
    expect(claim(s1, 'a', 'p9', 1).ok).toBe(true);
  });
});
