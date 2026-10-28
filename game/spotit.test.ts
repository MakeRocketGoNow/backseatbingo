import { describe, expect, it } from 'vitest';
import type { PackItem, Player } from '../shared/types';
import {
  CLAIM_WINDOW_MS,
  addSpotItPlayer,
  approveClaim,
  claim,
  claimBy,
  claimsOn,
  createSpotItGame,
  endSpotItGame,
  finisher,
  listFinished,
  reassign,
  recentCall,
  remainingFor,
  spotItStandings,
  unclaim,
  upgradeGame,
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

/** Comfortably past the claim window. */
const LATER = CLAIM_WINDOW_MS + 1;

function fresh() {
  return createSpotItGame(players, items);
}

describe('Called It claims', () => {
  it('every player can cross off every item, once each', () => {
    const r1 = claim(fresh(), 'a', 'p1', 1);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    expect(r1.state.claims['a']).toEqual([{ itemId: 'a', playerId: 'p1', at: 1, status: 'claimed' }]);

    const r2 = claim(r1.state, 'a', 'p2', 1 + LATER);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(claimsOn(r2.state, 'a').map((c) => c.playerId)).toEqual(['p1', 'p2']);
    expect(claimBy(r2.state, 'a', 'p3')).toBeUndefined();

    expect(claim(r2.state, 'a', 'p1', 2 + 2 * LATER)).toEqual({ ok: false, error: 'already-claimed' });
  });

  it('a call inside the claim window is the same sighting and is rejected', () => {
    const r1 = claim(fresh(), 'a', 'p1', 1000);
    if (!r1.ok) throw new Error(r1.error);
    expect(claim(r1.state, 'a', 'p2', 1000 + CLAIM_WINDOW_MS - 1)).toEqual({ ok: false, error: 'just-called' });
    expect(recentCall(r1.state, 'a', 1000 + CLAIM_WINDOW_MS - 1)?.playerId).toBe('p1');
    expect(recentCall(r1.state, 'a', 1000 + CLAIM_WINDOW_MS)).toBeUndefined();
    expect(claim(r1.state, 'a', 'p2', 1000 + CLAIM_WINDOW_MS).ok).toBe(true);
    // The player's own window does not stop them from being told they already have it.
    expect(claim(r1.state, 'a', 'p1', 1001)).toEqual({ ok: false, error: 'already-claimed' });
  });

  it('the latest call owns the window', () => {
    const r1 = claim(fresh(), 'a', 'p1', 1000);
    if (!r1.ok) throw new Error(r1.error);
    const r2 = claim(r1.state, 'a', 'p2', 1000 + LATER);
    if (!r2.ok) throw new Error(r2.error);
    expect(recentCall(r2.state, 'a', 1000 + LATER + 1)?.playerId).toBe('p2');
    expect(claim(r2.state, 'a', 'p3', 1000 + LATER + 1)).toEqual({ ok: false, error: 'just-called' });
  });

  it('rejects unknown items and players', () => {
    expect(claim(fresh(), 'zzz', 'p1', 1)).toEqual({ ok: false, error: 'unknown-item' });
    expect(claim(fresh(), 'a', 'nobody', 1)).toEqual({ ok: false, error: 'unknown-player' });
  });

  it('does not mutate the previous state', () => {
    const s0 = fresh();
    claim(s0, 'a', 'p1', 1);
    expect(s0.claims).toEqual({});
    const s1 = claim(s0, 'a', 'p1', 1);
    if (!s1.ok) throw new Error(s1.error);
    claim(s1.state, 'a', 'p2', 1 + LATER);
    expect(claimsOn(s1.state, 'a')).toHaveLength(1);
  });

  it('undo takes the item from one player and leaves the others', () => {
    const s1 = claim(fresh(), 'a', 'p1', 1);
    if (!s1.ok) throw new Error('claim failed');
    const s2 = claim(s1.state, 'a', 'p2', 1 + LATER);
    if (!s2.ok) throw new Error('claim failed');
    const s3 = unclaim(s2.state, 'a', 'p1');
    expect(s3.ok).toBe(true);
    if (!s3.ok) return;
    expect(claimsOn(s3.state, 'a').map((c) => c.playerId)).toEqual(['p2']);
    const s4 = unclaim(s3.state, 'a', 'p2');
    if (!s4.ok) throw new Error('unclaim failed');
    expect(s4.state.claims['a']).toBeUndefined();
    expect(claim(s4.state, 'a', 'p1', 3 + 2 * LATER).ok).toBe(true);
  });

  it('undo for a player without the item is an error', () => {
    expect(unclaim(fresh(), 'a', 'p1')).toEqual({ ok: false, error: 'not-claimed' });
    const s1 = claim(fresh(), 'a', 'p1', 1);
    if (!s1.ok) throw new Error('claim failed');
    expect(unclaim(s1.state, 'a', 'p2')).toEqual({ ok: false, error: 'not-claimed' });
  });

  it('reassign hands the call to another player and keeps its time', () => {
    const s1 = claim(fresh(), 'a', 'p1', 1000);
    if (!s1.ok) throw new Error('claim failed');
    const s2 = reassign(s1.state, 'a', 'p1', 'p3');
    expect(s2.ok).toBe(true);
    if (!s2.ok) return;
    expect(claimsOn(s2.state, 'a')).toEqual([{ itemId: 'a', playerId: 'p3', at: 1000, status: 'claimed' }]);
    expect(reassign(s2.state, 'b', 'p1', 'p2')).toEqual({ ok: false, error: 'not-claimed' });
    expect(reassign(s2.state, 'a', 'p1', 'p2')).toEqual({ ok: false, error: 'not-claimed' });
    expect(reassign(s2.state, 'a', 'p3', 'ghost')).toEqual({ ok: false, error: 'unknown-player' });
    const s3 = claim(s2.state, 'a', 'p2', 1000 + LATER);
    if (!s3.ok) throw new Error('claim failed');
    expect(reassign(s3.state, 'a', 'p3', 'p2')).toEqual({ ok: false, error: 'already-claimed' });
  });

  it('ends when a player finishes the whole list', () => {
    let s = fresh();
    const r0 = claim(s, 'a', 'p2', 1);
    if (!r0.ok) throw new Error(r0.error);
    s = r0.state;
    for (const [i, item] of items.entries()) {
      const r = claim(s, item.id, 'p1', (i + 1) * LATER);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(listFinished(s)).toBe(true);
    expect(finisher(s)?.id).toBe('p1');
    expect(s.status).toBe('ended');
    expect(s.endedAt).toBe(3 * LATER);
    expect(claim(s, 'b', 'p2', 9 * LATER)).toEqual({ ok: false, error: 'not-playing' });
  });

  it('counts what each player still has to find', () => {
    const s = fresh();
    expect(remainingFor(s, 'p1')).toBe(3);
    const r = claim(s, 'a', 'p1', 1, true);
    if (!r.ok) throw new Error(r.error);
    expect(remainingFor(r.state, 'p1')).toBe(2);
    expect(remainingFor(r.state, 'p2')).toBe(3);
  });

  it('host can end early and no further changes are accepted', () => {
    const s1 = claim(fresh(), 'a', 'p1', 1);
    if (!s1.ok) throw new Error('claim failed');
    const ended = endSpotItGame(s1.state, 10);
    expect(ended.status).toBe('ended');
    expect(finisher(ended)).toBeUndefined();
    expect(claim(ended, 'b', 'p2', 11)).toEqual({ ok: false, error: 'not-playing' });
    expect(unclaim(ended, 'a', 'p1')).toEqual({ ok: false, error: 'not-playing' });
    expect(reassign(ended, 'a', 'p1', 'p2')).toEqual({ ok: false, error: 'not-playing' });
    expect(endSpotItGame(ended, 99)).toBe(ended);
  });
});

describe('Called It scoring', () => {
  it('counts each player\'s claims and sorts descending with shared ranks', () => {
    let s = fresh();
    let at = 0;
    for (const [item, who] of [
      ['a', 'p2'],
      ['b', 'p2'],
      ['c', 'p3'],
      ['a', 'p3'],
    ] as const) {
      at += LATER;
      const r = claim(s, item, who, at);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    const standings = spotItStandings(s);
    expect(standings.map((x) => [x.player.id, x.score, x.rank])).toEqual([
      ['p2', 2, 1],
      ['p3', 2, 1],
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
  it('a pending claim holds the window and the item for its player but does not score', () => {
    const r1 = claim(fresh(), 'a', 'p1', 1000, true);
    if (!r1.ok) throw new Error(r1.error);
    expect(claimBy(r1.state, 'a', 'p1')?.status).toBe('pending');
    expect(spotItStandings(r1.state).find((s) => s.player.id === 'p1')?.score).toBe(0);
    expect(claim(r1.state, 'a', 'p2', 1001)).toEqual({ ok: false, error: 'just-called' });
    expect(claim(r1.state, 'a', 'p1', 1000 + LATER)).toEqual({ ok: false, error: 'already-claimed' });
  });

  it('approve scores it and can end the game; reject frees it for that player', () => {
    let s = fresh();
    for (const [i, item] of ['a', 'b', 'c'].entries()) {
      const r = claim(s, item, 'p1', (i + 1) * LATER, true);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    expect(listFinished(s)).toBe(false);
    const rej = unclaim(s, 'c', 'p1');
    if (!rej.ok) throw new Error(rej.error);
    expect(rej.state.claims['c']).toBeUndefined();

    let t = s;
    for (const item of ['a', 'b', 'c']) {
      const r = approveClaim(t, item, 'p1', 5);
      if (!r.ok) throw new Error(r.error);
      t = r.state;
    }
    expect(spotItStandings(t)[0]?.score).toBe(3);
    expect(t.status).toBe('ended');
    expect(approveClaim(fresh(), 'a', 'p1', 1)).toEqual({ ok: false, error: 'not-claimed' });
  });

  it('a late approval keeps the time of the call and does not reopen the window', () => {
    const r1 = claim(fresh(), 'a', 'p1', 1000, true);
    if (!r1.ok) throw new Error(r1.error);
    const ok = approveClaim(r1.state, 'a', 'p1', 1000 + 60 * LATER);
    if (!ok.ok) throw new Error(ok.error);
    expect(claimBy(ok.state, 'a', 'p1')).toEqual({ itemId: 'a', playerId: 'p1', at: 1000, status: 'claimed' });
    expect(recentCall(ok.state, 'a', 1001 + 60 * LATER)).toBeUndefined();
    expect(claim(ok.state, 'a', 'p2', 1001 + 60 * LATER).ok).toBe(true);
  });

  it('approving an already approved claim is a no-op', () => {
    const r1 = claim(fresh(), 'a', 'p1', 1);
    if (!r1.ok) throw new Error(r1.error);
    const r2 = approveClaim(r1.state, 'a', 'p1', 2);
    expect(r2.ok && r2.state).toBe(r1.state);
  });
});

describe('stored games from before protocol 2', () => {
  it('wraps a single claim per item into a list and leaves current games alone', () => {
    const old = { ...fresh(), claims: { a: { itemId: 'a', playerId: 'p1', at: 1, status: 'claimed' } } } as unknown as ReturnType<typeof fresh>;
    const up = upgradeGame(old);
    expect(up.mode === 'spotit' && up.claims).toEqual({ a: [{ itemId: 'a', playerId: 'p1', at: 1, status: 'claimed' }] });
    expect(upgradeGame(up)).toBe(up);
    const current = claim(fresh(), 'a', 'p1', 1);
    if (!current.ok) throw new Error(current.error);
    expect(upgradeGame(current.state)).toBe(current.state);
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
