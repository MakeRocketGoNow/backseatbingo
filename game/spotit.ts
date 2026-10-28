import type { Claim, GameState, PackItem, Player, SpotItState, Standing } from '../shared/types';

export type SpotItError =
  | 'not-playing'
  | 'unknown-item'
  | 'unknown-player'
  | 'already-claimed'
  | 'just-called'
  | 'not-claimed';

export type Result<T> = { ok: true; state: T } | { ok: false; error: SpotItError };

/**
 * How long one player's call keeps everyone else off the item. The app cannot
 * tell two red barns apart, so for this long after a call the item is treated
 * as that sighting: a second tap on it is the same barn, not a new one.
 */
export const CLAIM_WINDOW_MS = 10_000;

export function createSpotItGame(players: Player[], items: PackItem[]): SpotItState {
  return { mode: 'spotit', status: 'playing', players, items, claims: {} };
}

/**
 * Bring a stored game up to the current shape. Before protocol 2 an item held
 * one claim, not a list; a room or a saved local game from that build can
 * still be open when this one arrives. Returns the same object when there is
 * nothing to change.
 */
export function upgradeGame(game: GameState): GameState {
  if (game.mode !== 'spotit') return game;
  const legacy = Object.entries(game.claims as Record<string, Claim | Claim[]>).filter(([, c]) => !Array.isArray(c));
  if (legacy.length === 0) return game;
  const claims = { ...game.claims };
  for (const [itemId, c] of legacy) claims[itemId] = [c as Claim];
  return { ...game, claims };
}

function hasPlayer(state: SpotItState, playerId: string): boolean {
  return state.players.some((p) => p.id === playerId);
}

function hasItem(state: SpotItState, itemId: string): boolean {
  return state.items.some((i) => i.id === itemId);
}

/** Every call on an item, oldest first. */
export function claimsOn(state: SpotItState, itemId: string): Claim[] {
  return state.claims[itemId] ?? [];
}

export function claimBy(state: SpotItState, itemId: string, playerId: string): Claim | undefined {
  return claimsOn(state, itemId).find((c) => c.playerId === playerId);
}

/** The call still inside its claim window at `now`, if any. */
export function recentCall(state: SpotItState, itemId: string, now: number): Claim | undefined {
  let latest: Claim | undefined;
  for (const c of claimsOn(state, itemId)) {
    if (!latest || c.at > latest.at) latest = c;
  }
  return latest && now - latest.at < CLAIM_WINDOW_MS ? latest : undefined;
}

function withClaims(state: SpotItState, itemId: string, claims: Claim[]): SpotItState {
  const next = { ...state.claims };
  if (claims.length === 0) delete next[itemId];
  else next[itemId] = claims;
  return { ...state, claims: next };
}

/**
 * Cross an item off for a player. Every player can have every item, once
 * each, but not the same sighting: a call inside another player's claim
 * window is rejected. With `pending` the claim is listed but does not score
 * until `approveClaim`.
 */
export function claim(
  state: SpotItState,
  itemId: string,
  playerId: string,
  at: number,
  pending = false,
): Result<SpotItState> {
  if (state.status !== 'playing') return { ok: false, error: 'not-playing' };
  if (!hasItem(state, itemId)) return { ok: false, error: 'unknown-item' };
  if (!hasPlayer(state, playerId)) return { ok: false, error: 'unknown-player' };
  if (claimBy(state, itemId, playerId)) return { ok: false, error: 'already-claimed' };
  if (recentCall(state, itemId, at)) return { ok: false, error: 'just-called' };
  const next: Claim = { itemId, playerId, at, status: pending ? 'pending' : 'claimed' };
  const nextState = withClaims(state, itemId, [...claimsOn(state, itemId), next]);
  return { ok: true, state: listFinished(nextState) ? endSpotItGame(nextState, at) : nextState };
}

/**
 * Host approves a player's pending claim. It then scores like any other
 * claim. The claim keeps the time of the call, not of the approval, so an
 * approval minutes later does not start a new claim window.
 */
export function approveClaim(state: SpotItState, itemId: string, playerId: string, at: number): Result<SpotItState> {
  if (state.status !== 'playing') return { ok: false, error: 'not-playing' };
  const existing = claimBy(state, itemId, playerId);
  if (!existing) return { ok: false, error: 'not-claimed' };
  if (existing.status === 'claimed') return { ok: true, state };
  const claims = claimsOn(state, itemId).map((c) => (c === existing ? { ...c, status: 'claimed' as const } : c));
  const nextState = withClaims(state, itemId, claims);
  return { ok: true, state: listFinished(nextState) ? endSpotItGame(nextState, at) : nextState };
}

/** Add a late joiner. Idempotent for players already in the game. */
export function addSpotItPlayer(state: SpotItState, player: Player): SpotItState {
  if (hasPlayer(state, player.id)) return state;
  return { ...state, players: [...state.players, player] };
}

/** Host undo, or rejection of a pending claim. The player loses the item; everyone else's calls stand. */
export function unclaim(state: SpotItState, itemId: string, playerId: string): Result<SpotItState> {
  if (state.status !== 'playing') return { ok: false, error: 'not-playing' };
  const existing = claimBy(state, itemId, playerId);
  if (!existing) return { ok: false, error: 'not-claimed' };
  return { ok: true, state: withClaims(state, itemId, claimsOn(state, itemId).filter((c) => c !== existing)) };
}

/**
 * Host reassign: the call was really someone else's. The claim keeps its
 * time, so handing it over does not restart the claim window.
 */
export function reassign(state: SpotItState, itemId: string, from: string, to: string): Result<SpotItState> {
  if (state.status !== 'playing') return { ok: false, error: 'not-playing' };
  const existing = claimBy(state, itemId, from);
  if (!existing) return { ok: false, error: 'not-claimed' };
  if (!hasPlayer(state, to)) return { ok: false, error: 'unknown-player' };
  if (claimBy(state, itemId, to)) return { ok: false, error: 'already-claimed' };
  const claims = claimsOn(state, itemId).map((c) => (c === existing ? { ...c, playerId: to } : c));
  return { ok: true, state: withClaims(state, itemId, claims) };
}

/** Items the player has not crossed off (pending claims count as crossed off, they are waiting on the host). */
export function remainingFor(state: SpotItState, playerId: string): number {
  return state.items.filter((item) => !claimBy(state, item.id, playerId)).length;
}

/** The first player to cross off the whole list, if anyone has. */
export function finisher(state: SpotItState): Player | undefined {
  return state.players.find((p) => scoreFor(state, p.id) === state.items.length);
}

export function listFinished(state: SpotItState): boolean {
  return finisher(state) !== undefined;
}

export function endSpotItGame(state: SpotItState, at: number): SpotItState {
  if (state.status === 'ended') return state;
  return { ...state, status: 'ended', endedAt: at };
}

export function scoreFor(state: SpotItState, playerId: string): number {
  let n = 0;
  for (const claims of Object.values(state.claims)) {
    for (const c of claims) {
      if (c.playerId === playerId && c.status === 'claimed') n++;
    }
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
