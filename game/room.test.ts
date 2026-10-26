import { describe, expect, it } from 'vitest';
import type { Pack, RoomSettings, RoomState } from '../shared/types';
import { MAX_ROOM_PLAYERS } from '../shared/types';
import { applyAction, createRoom, joinRoom, setConnected } from './room';
import { seededRng } from './rng';

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

  it('auto mode: first tap wins and the loser gets the claimer name', () => {
    const r = playing();
    const item = firstItem(r);
    const r2 = must(applyAction(r, 'g1', { type: 'claim', itemId: item }, 4, rng()));
    const lost = applyAction(r2, 'h', { type: 'claim', itemId: item }, 5, rng());
    expect(lost.error).toEqual({ code: 'already-claimed', message: 'Kid got it' });
    expect(lost.room).toBe(r2);
  });

  it('host approvals: guest claims wait, host claims do not, host approves or rejects', () => {
    const r = playing({ approvals: 'host' });
    const [a, b] = r.game?.mode === 'spotit' ? r.game.items.map((i) => i.id) : [];
    let s = must(applyAction(r, 'g1', { type: 'claim', itemId: a! }, 4, rng()));
    s = must(applyAction(s, 'h', { type: 'claim', itemId: b! }, 5, rng()));
    if (s.game?.mode !== 'spotit') throw new Error('mode');
    expect(s.game.claims[a!]?.status).toBe('pending');
    expect(s.game.claims[b!]?.status).toBe('claimed');

    expect(applyAction(s, 'g1', { type: 'approve', itemId: a! }, 6, rng()).error?.code).toBe('not-host');
    const approved = must(applyAction(s, 'h', { type: 'approve', itemId: a! }, 6, rng()));
    if (approved.game?.mode !== 'spotit') throw new Error('mode');
    expect(approved.game.claims[a!]?.status).toBe('claimed');

    const rejected = must(applyAction(s, 'h', { type: 'unclaim', itemId: a! }, 7, rng()));
    if (rejected.game?.mode !== 'spotit') throw new Error('mode');
    expect(rejected.game.claims[a!]).toBeUndefined();
  });

  it('host can reassign; guests cannot undo', () => {
    const r = playing();
    const item = firstItem(r);
    const r2 = must(applyAction(r, 'g1', { type: 'claim', itemId: item }, 4, rng()));
    expect(applyAction(r2, 'g1', { type: 'unclaim', itemId: item }, 5, rng()).error?.code).toBe('not-host');
    const r3 = must(applyAction(r2, 'h', { type: 'reassign', itemId: item, playerId: 'h' }, 5, rng()));
    if (r3.game?.mode !== 'spotit') throw new Error('mode');
    expect(r3.game.claims[item]?.playerId).toBe('h');
  });

  it('the room ends when the list is exhausted or the host ends it', () => {
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

  it('unknown players are rejected', () => {
    expect(applyAction(room(), 'ghost', { type: 'start' }, 3, rng()).error?.code).toBe('not-joined');
  });
});
