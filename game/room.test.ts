import { describe, expect, it } from 'vitest';
import type { Pack, RoomSettings, RoomState } from '../shared/types';
import { MAX_NAME_LENGTH, MAX_ROOM_PLAYERS } from '../shared/types';
import { applyAction, createRoom, joinRoom, setConnected } from './room';
import { seededRng } from './rng';
import { CLAIM_WINDOW_MS } from './spotit';

const pack: Pack = {
  id: 'test',
  name: 'Test',
  description: '',
  free: true,
  minAge: 0,
  items: Array.from({ length: 30 }, (_, i) => ({ id: `i${i}`, text: `Item ${i}` })),
};
const settings: RoomSettings = { mode: 'spotit', listLength: 'quick', pattern: 'line', approvals: 'auto' };
const rng = () => seededRng(1);

function room(overrides: Partial<RoomSettings> = {}): RoomState {
  const r = createRoom({ code: 'ABCD', host: { id: 'h', name: 'Dad' }, settings: { ...settings, ...overrides }, pack, now: 1 });
  const j = joinRoom(r, { id: 'g1', name: 'Kid' }, 2, rng());
  if (j.error) throw new Error(j.error.code);
  return j.room;
}

function must(r: { room: RoomState; error?: { code: string } }): RoomState {
  if (r.error) throw new Error(r.error.code);
  return r.room;
}

describe('lobby', () => {
  it('creates with the host connected and lets guests join', () => {
    const r = room();
    expect(r.status).toBe('lobby');
    expect(r.players.map((p) => [p.id, p.connected])).toEqual([
      ['h', true],
      ['g1', true],
    ]);
  });

  it('rejects duplicate names, enforces the cap, and treats rejoin as reconnect', () => {
    let r = room();
    expect(joinRoom(r, { id: 'g2', name: 'kid' }, 3, rng()).error?.code).toBe('name-taken');
    r = setConnected(r, 'g1', false, 4);
    expect(r.players[1]?.connected).toBe(false);
    r = must(joinRoom(r, { id: 'g1', name: 'Whatever' }, 5, rng()));
    expect(r.players).toHaveLength(2);
    expect(r.players[1]?.connected).toBe(true);
    expect(r.players[1]?.name).toBe('Kid');

    for (let i = r.players.length; i < MAX_ROOM_PLAYERS; i++) {
      r = must(joinRoom(r, { id: `x${i}`, name: `P${i}` }, 6, rng()));
    }
    expect(joinRoom(r, { id: 'late', name: 'Late' }, 7, rng()).error?.code).toBe('room-full');
  });

  it('only the host can change settings, and only in the lobby', () => {
    const r = room();
    expect(applyAction(r, 'g1', { type: 'settings', settings }, 3, rng()).error?.code).toBe('not-host');
    const changed = must(applyAction(r, 'h', { type: 'settings', settings: { ...settings, mode: 'bingo' } }, 3, rng()));
    expect(changed.settings.mode).toBe('bingo');
    const playing = must(applyAction(changed, 'h', { type: 'start' }, 4, rng()));
    expect(applyAction(playing, 'h', { type: 'settings', settings }, 5, rng()).error?.code).toBe('bad-status');
  });

  it('only the host can start, and bingo needs 24 items', () => {
    const r = room();
    expect(applyAction(r, 'g1', { type: 'start' }, 3, rng()).error?.code).toBe('not-host');
    const started = must(applyAction(r, 'h', { type: 'start' }, 3, rng()));
    expect(started.status).toBe('playing');
    expect(started.round).toBe(1);
    expect(started.game?.mode).toBe('spotit');
    if (started.game?.mode === 'spotit') expect(started.game.items).toHaveLength(15);

    const small = { ...room({ mode: 'bingo' }), pack: { ...pack, items: pack.items.slice(0, 10) } };
    expect(applyAction(small, 'h', { type: 'start' }, 3, rng()).error?.code).toBe('not-enough-items');
  });
});

describe('Called It in a room', () => {
  function playing(overrides: Partial<RoomSettings> = {}) {
    return must(applyAction(room(overrides), 'h', { type: 'start' }, 3, rng()));
  }
  const firstItem = (r: RoomState) => (r.game?.mode === 'spotit' ? r.game.items[0]!.id : '');

  it('auto mode: everyone can call an item, but not inside another call\'s window', () => {
    const r = playing();
    const item = firstItem(r);
    const r2 = must(applyAction(r, 'g1', { type: 'claim', itemId: item }, 4, rng()));
    const same = applyAction(r2, 'h', { type: 'claim', itemId: item }, 5, rng());
    expect(same.error).toEqual({ code: 'just-called', message: 'Kid just called it' });
    expect(same.room).toBe(r2);
    const r3 = must(applyAction(r2, 'h', { type: 'claim', itemId: item }, 4 + CLAIM_WINDOW_MS, rng()));
    if (r3.game?.mode !== 'spotit') throw new Error('mode');
    expect(r3.game.claims[item]?.map((c) => c.playerId)).toEqual(['g1', 'h']);
    const twice = applyAction(r3, 'h', { type: 'claim', itemId: item }, 5 + 2 * CLAIM_WINDOW_MS, rng());
    expect(twice.error).toEqual({ code: 'already-claimed', message: 'You already called that one' });
  });

  it('host approvals: guest claims wait, host claims do not, host approves or rejects', () => {
    const r = playing({ approvals: 'host' });
    const [a, b] = r.game?.mode === 'spotit' ? r.game.items.map((i) => i.id) : [];
    let s = must(applyAction(r, 'g1', { type: 'claim', itemId: a! }, 4, rng()));
    s = must(applyAction(s, 'h', { type: 'claim', itemId: b! }, 5, rng()));
    if (s.game?.mode !== 'spotit') throw new Error('mode');
    expect(s.game.claims[a!]?.[0]?.status).toBe('pending');
    expect(s.game.claims[b!]?.[0]?.status).toBe('claimed');

    expect(applyAction(s, 'g1', { type: 'approve', itemId: a!, playerId: 'g1' }, 6, rng()).error?.code).toBe('not-host');
    const approved = must(applyAction(s, 'h', { type: 'approve', itemId: a!, playerId: 'g1' }, 6, rng()));
    if (approved.game?.mode !== 'spotit') throw new Error('mode');
    expect(approved.game.claims[a!]?.[0]?.status).toBe('claimed');

    const rejected = must(applyAction(s, 'h', { type: 'unclaim', itemId: a!, playerId: 'g1' }, 7, rng()));
    if (rejected.game?.mode !== 'spotit') throw new Error('mode');
    expect(rejected.game.claims[a!]).toBeUndefined();
  });

  it('an approval long after the call does not grey the item again', () => {
    const r = playing({ approvals: 'host' });
    const item = firstItem(r);
    const s = must(applyAction(r, 'g1', { type: 'claim', itemId: item }, 4, rng()));
    const later = 4 + 30 * CLAIM_WINDOW_MS;
    const approved = must(applyAction(s, 'h', { type: 'approve', itemId: item, playerId: 'g1' }, later, rng()));
    expect(applyAction(approved, 'h', { type: 'claim', itemId: item }, later + 1, rng()).error).toBeUndefined();
  });

  it('the game ends when an approval completes a guest\'s list', () => {
    let r = playing({ approvals: 'host' });
    if (r.game?.mode !== 'spotit') throw new Error('mode');
    for (const item of r.game.items) {
      r = must(applyAction(r, 'g1', { type: 'claim', itemId: item.id }, 4, rng()));
    }
    expect(r.status).toBe('playing');
    if (r.game?.mode !== 'spotit') throw new Error('mode');
    for (const item of r.game.items) {
      r = must(applyAction(r, 'h', { type: 'approve', itemId: item.id, playerId: 'g1' }, 5, rng()));
    }
    expect(r.status).toBe('ended');
    expect(r.game?.status).toBe('ended');
  });

  it('host can reassign; guests cannot undo', () => {
    const r = playing();
    const item = firstItem(r);
    const r2 = must(applyAction(r, 'g1', { type: 'claim', itemId: item }, 4, rng()));
    expect(applyAction(r2, 'g1', { type: 'unclaim', itemId: item, playerId: 'g1' }, 5, rng()).error?.code).toBe('not-host');
    const r3 = must(applyAction(r2, 'h', { type: 'reassign', itemId: item, from: 'g1', to: 'h' }, 5, rng()));
    if (r3.game?.mode !== 'spotit') throw new Error('mode');
    expect(r3.game.claims[item]?.map((c) => c.playerId)).toEqual(['h']);
    const r4 = must(applyAction(r3, 'g1', { type: 'claim', itemId: item }, 4 + CLAIM_WINDOW_MS, rng()));
    const back = applyAction(r4, 'h', { type: 'reassign', itemId: item, from: 'h', to: 'g1' }, 5 + CLAIM_WINDOW_MS, rng());
    expect(back.error).toEqual({ code: 'already-claimed', message: 'They already have that one' });
  });

  it('the room ends when a player finishes the list or the host ends it', () => {
    let r = playing();
    if (r.game?.mode !== 'spotit') throw new Error('mode');
    for (const item of r.game.items) {
      r = must(applyAction(r, 'g1', { type: 'claim', itemId: item.id }, 4, rng()));
    }
    expect(r.status).toBe('ended');
    expect(r.game?.status).toBe('ended');

    const r2 = playing();
    expect(applyAction(r2, 'g1', { type: 'end' }, 4, rng()).error?.code).toBe('not-host');
    const ended = must(applyAction(r2, 'h', { type: 'end' }, 4, rng()));
    expect(ended.status).toBe('ended');
    expect(applyAction(ended, 'g1', { type: 'claim', itemId: firstItem(ended) }, 5, rng()).error?.code).toBe('bad-status');
  });

  it('bingo actions are rejected in Called It', () => {
    const r = playing();
    expect(applyAction(r, 'g1', { type: 'mark', cell: 1 }, 4, rng()).error?.code).toBe('wrong-mode');
  });
});

describe('Bingo in a room', () => {
  function playing() {
    return must(applyAction(room({ mode: 'bingo', pattern: 'corners' }), 'h', { type: 'start' }, 3, rng()));
  }

  it('marks are per player and idempotent, bingo is verified', () => {
    let r = playing();
    r = must(applyAction(r, 'g1', { type: 'mark', cell: 0 }, 4, rng()));
    r = must(applyAction(r, 'g1', { type: 'mark', cell: 0 }, 5, rng()));
    if (r.game?.mode !== 'bingo') throw new Error('mode');
    expect(r.game.cards['g1']?.marks[0]).toBe(true);
    expect(r.game.cards['h']?.marks[0]).toBe(false);
    expect(applyAction(r, 'g1', { type: 'bingo' }, 6, rng()).error?.code).toBe('pattern-not-met');
    for (const c of [4, 20, 24]) r = must(applyAction(r, 'g1', { type: 'mark', cell: c }, 7, rng()));
    r = must(applyAction(r, 'g1', { type: 'bingo' }, 8, rng()));
    if (r.game?.mode !== 'bingo') throw new Error('mode');
    expect(r.game.winners.map((w) => w.playerId)).toEqual(['g1']);
    expect(r.status).toBe('playing');
    r = must(applyAction(r, 'g1', { type: 'unmark', cell: 0 }, 9, rng()));
    if (r.game?.mode !== 'bingo') throw new Error('mode');
    expect(r.game.cards['g1']?.marks[0]).toBe(false);
  });

  it('a late joiner gets a card mid-game', () => {
    const r = playing();
    const late = must(joinRoom(r, { id: 'g2', name: 'Late' }, 4, rng()));
    if (late.game?.mode !== 'bingo') throw new Error('mode');
    expect(late.game.cards['g2']?.cells).toHaveLength(25);
    expect(late.game.players.map((p) => p.id)).toEqual(['h', 'g1', 'g2']);
  });
});

describe('leaving mid-round', () => {
  function spotIt() {
    const r = must(applyAction(room(), 'h', { type: 'start' }, 3, rng()));
    const item = r.game?.mode === 'spotit' ? r.game.items[0]!.id : '';
    return { r: must(applyAction(r, 'g1', { type: 'claim', itemId: item }, 4, rng())), item };
  }

  it('keeps their claims and score but marks them as left', () => {
    const { r, item } = spotIt();
    const left = must(applyAction(r, 'g1', { type: 'leave' }, 5, rng()));
    expect(left.players.map((p) => p.id)).toEqual(['h']);
    if (left.game?.mode !== 'spotit') throw new Error('mode');
    expect(left.game.players.find((p) => p.id === 'g1')).toEqual({ id: 'g1', name: 'Kid', left: true });
    expect(left.game.claims[item]?.[0]?.playerId).toBe('g1');
    expect(applyAction(left, 'h', { type: 'claim', itemId: item }, 5, rng()).error?.message).toBe('Kid just called it');
    const other = left.game.items[1]!.id;
    const handed = must(applyAction(left, 'h', { type: 'claim', itemId: other }, 6, rng()));
    expect(applyAction(handed, 'h', { type: 'reassign', itemId: other, from: 'h', to: 'g1' }, 7, rng()).error?.code).toBe(
      'unknown-player',
    );
  });

  it('reserves their name for the round, and gives everything back if they return', () => {
    const { r, item } = spotIt();
    const left = must(applyAction(r, 'g1', { type: 'leave' }, 5, rng()));
    expect(joinRoom(left, { id: 'g2', name: 'kid' }, 6, rng()).error?.code).toBe('name-taken');
    const back = must(joinRoom(left, { id: 'g1', name: 'Kiddo' }, 7, rng()));
    expect(back.players.find((p) => p.id === 'g1')?.name).toBe('Kiddo');
    if (back.game?.mode !== 'spotit') throw new Error('mode');
    expect(back.game.players.find((p) => p.id === 'g1')).toEqual({ id: 'g1', name: 'Kiddo' });
    expect(back.game.claims[item]?.[0]?.playerId).toBe('g1');
  });

  it('the next round starts without them and frees their name', () => {
    const { r } = spotIt();
    let s = must(applyAction(r, 'g1', { type: 'leave' }, 5, rng()));
    s = must(applyAction(s, 'h', { type: 'newRound', settings }, 6, rng()));
    expect(s.game?.players.map((p) => p.id)).toEqual(['h']);
    expect(joinRoom(s, { id: 'g2', name: 'Kid' }, 7, rng()).error).toBeUndefined();
  });

  it('ends a Bingo round when everyone still playing has bingo', () => {
    let r = must(applyAction(room({ mode: 'bingo', pattern: 'corners' }), 'h', { type: 'start' }, 3, rng()));
    for (const c of [0, 4, 20, 24]) r = must(applyAction(r, 'h', { type: 'mark', cell: c }, 4, rng()));
    r = must(applyAction(r, 'h', { type: 'bingo' }, 5, rng()));
    expect(r.status).toBe('playing');
    r = must(applyAction(r, 'g1', { type: 'leave' }, 6, rng()));
    expect(r.status).toBe('ended');
    expect(r.game?.status).toBe('ended');
  });

  it('caps a round at twice the room size, counting people who left', () => {
    let r = must(applyAction(room(), 'h', { type: 'start' }, 3, rng()));
    for (let i = 0; i < MAX_ROOM_PLAYERS * 2 - 2; i++) {
      r = must(joinRoom(r, { id: `x${i}`, name: `X${i}` }, 4, rng()));
      r = must(applyAction(r, `x${i}`, { type: 'leave' }, 5, rng()));
    }
    expect(r.game?.players).toHaveLength(MAX_ROOM_PLAYERS * 2);
    expect(joinRoom(r, { id: 'late', name: 'Late' }, 6, rng()).error?.code).toBe('room-full');
    // Someone already listed can still come back, and the cap lifts once the round is over.
    expect(joinRoom(r, { id: 'x0', name: 'X0' }, 6, rng()).error).toBeUndefined();
    const ended = must(applyAction(r, 'h', { type: 'end' }, 7, rng()));
    expect(joinRoom(ended, { id: 'late', name: 'Late' }, 8, rng()).error).toBeUndefined();
  });
});

describe('rounds and leaving', () => {
  it('newRound keeps players and applies new settings', () => {
    let r = must(applyAction(room(), 'h', { type: 'start' }, 3, rng()));
    r = must(applyAction(r, 'h', { type: 'end' }, 4, rng()));
    expect(applyAction(r, 'g1', { type: 'newRound', settings }, 5, rng()).error?.code).toBe('not-host');
    r = must(applyAction(r, 'h', { type: 'newRound', settings: { ...settings, mode: 'bingo' } }, 5, rng()));
    expect(r.status).toBe('playing');
    expect(r.round).toBe(2);
    expect(r.game?.mode).toBe('bingo');
    expect(r.game?.players.map((p) => p.id)).toEqual(['h', 'g1']);
  });

  it('rejects a game tap made in an earlier round', () => {
    let r = must(applyAction(room(), 'h', { type: 'start' }, 3, rng()));
    const itemId = r.game?.mode === 'spotit' ? r.game.items[0]!.id : '';
    r = must(applyAction(r, 'h', { type: 'newRound', settings }, 4, rng()));
    expect(r.round).toBe(2);
    expect(applyAction(r, 'g1', { type: 'claim', itemId, round: 1 }, 5, rng()).error?.message).toBe('That round is over.');
    expect(applyAction(r, 'g1', { type: 'mark', cell: 0, round: 1 }, 5, rng()).error?.code).toBe('bad-status');
  });

  it('a guest leaving is removed; the host leaving or closing ends the room', () => {
    const r = room();
    const left = must(applyAction(r, 'g1', { type: 'leave' }, 3, rng()));
    expect(left.players.map((p) => p.id)).toEqual(['h']);
    expect(applyAction(r, 'g1', { type: 'close' }, 3, rng()).error?.code).toBe('not-host');
    const closed = must(applyAction(r, 'h', { type: 'close' }, 3, rng()));
    expect(closed.status).toBe('closed');
    expect(applyAction(closed, 'g1', { type: 'claim', itemId: 'x' }, 4, rng()).error?.code).toBe('room-closed');
    expect(joinRoom(closed, { id: 'g9', name: 'New' }, 5, rng()).error?.code).toBe('room-closed');
    expect(must(applyAction(r, 'h', { type: 'leave' }, 3, rng())).status).toBe('closed');
  });

  it('a new player needs a name, cut to the maximum length', () => {
    expect(joinRoom(room(), { id: 'g2', name: '   ' }, 3, rng()).error?.code).toBe('not-joined');
    const long = must(joinRoom(room(), { id: 'g2', name: '  ' + 'x'.repeat(30) }, 3, rng()));
    expect(long.players.find((p) => p.id === 'g2')?.name).toBe('x'.repeat(MAX_NAME_LENGTH));
  });

  it('a guest who left needs a name to come back', () => {
    const left = must(applyAction(room(), 'g1', { type: 'leave' }, 3, rng()));
    expect(joinRoom(left, { id: 'g1', name: '' }, 4, rng()).error?.code).toBe('not-joined');
  });

  it('a known player keeps their name on reconnect', () => {
    const r = must(joinRoom(room(), { id: 'g1', name: '' }, 3, rng()));
    expect(r.players.find((p) => p.id === 'g1')?.name).toBe('Kid');
  });

  it('unknown players are rejected', () => {
    expect(applyAction(room(), 'ghost', { type: 'start' }, 3, rng()).error?.code).toBe('not-joined');
  });

  it('an unknown action is rejected rather than crashing the room', () => {
    const action = { type: 'explode' } as unknown as Parameters<typeof applyAction>[2];
    expect(applyAction(room(), 'h', action, 3, rng()).error?.code).toBe('bad-message');
  });
});
