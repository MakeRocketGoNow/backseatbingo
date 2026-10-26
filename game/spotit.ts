import type { Claim, PackItem, Player, SpotItState, Standing } from '../shared/types';

export type SpotItError = 'not-playing' | 'unknown-item' | 'unknown-player' | 'already-claimed' | 'not-claimed';

export type Result<T> = { ok: true; state: T } | { ok: false; error: SpotItError };

export function createSpotItGame(players: Player[], items: PackItem[]): SpotItState {
  return { mode: 'spotit', status: 'playing', players, items, claims: {} };
}

function hasPlayer(state: SpotItState, playerId: string): boolean {
  return state.players.some((p) => p.id === playerId);
}

function hasItem(state: SpotItState, itemId: string): boolean {
  return state.items.some((i) => i.id === itemId);
}

/** First-write-wins. A second claim on the same item is rejected. */
export function claim(state: SpotItState, itemId: string, playerId: string, at: number): Result<SpotItState> {
  if (state.status !== 'playing') return { ok: false, error: 'not-playing' };
  if (!hasItem(state, itemId)) return { ok: false, error: 'unknown-item' };
  if (!hasPlayer(state, playerId)) return { ok: false, error: 'unknown-player' };
  if (state.claims[itemId]) return { ok: false, error: 'already-claimed' };
  const next: Claim = { itemId, playerId, at, status: 'claimed' };
  const claims = { ...state.claims, [itemId]: next };
  const nextState: SpotItState = { ...state, claims };
  return { ok: true, state: isExhausted(nextState) ? endSpotItGame(nextState, at) : nextState };
}

/** Host undo. Returns the item to unclaimed. */
export function unclaim(state: SpotItState, itemId: string): Result<SpotItState> {
  if (state.status !== 'playing') return { ok: false, error: 'not-playing' };
  if (!state.claims[itemId]) return { ok: false, error: 'not-claimed' };
  const claims = { ...state.claims };
  delete claims[itemId];
  return { ok: true, state: { ...state, claims } };
}

/** Host reassign: hand an existing claim to a different player. */
export function reassign(state: SpotItState, itemId: string, playerId: string, at: number): Result<SpotItState> {
  if (state.status !== 'playing') return { ok: false, error: 'not-playing' };
  const existing = state.claims[itemId];
  if (!existing) return { ok: false, error: 'not-claimed' };
  if (!hasPlayer(state, playerId)) return { ok: false, error: 'unknown-player' };
  const claims = { ...state.claims, [itemId]: { ...existing, playerId, at } };
  return { ok: true, state: { ...state, claims } };
}

export function isExhausted(state: SpotItState): boolean {
  return state.items.every((item) => state.claims[item.id]?.status === 'claimed');
}

export function endSpotItGame(state: SpotItState, at: number): SpotItState {
  if (state.status === 'ended') return state;
  return { ...state, status: 'ended', endedAt: at };
}

export function scoreFor(state: SpotItState, playerId: string): number {
  let n = 0;
  for (const c of Object.values(state.claims)) {
    if (c.playerId === playerId && c.status === 'claimed') n++;
  }
  return n;
}

/**
 * Standings sorted by score descending. Ties share a rank and keep setup
 * order, so the display is stable while the game runs.
 */
export function spotItStandings(state: SpotItState): Standing[] {
  const scored = state.players.map((player) => ({ player, score: scoreFor(state, player.id) }));
  scored.sort((a, b) => b.score - a.score);
  const out: Standing[] = [];
  scored.forEach((s, i) => {
    const prev = out[i - 1];
    const rank = prev && prev.score === s.score ? prev.rank : i + 1;
    out.push({ ...s, rank });
  });
  return out;
}
