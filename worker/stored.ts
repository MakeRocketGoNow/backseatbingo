import type { RoomState } from '../shared/types';
import { findPlayer } from '../game/room';
import { upgradeGame } from '../game/spotit';

// What a room keeps in storage, and the bookkeeping on its token map. Pure,
// so Vitest can cover it without the Workers runtime.

export interface Stored {
  room: RoomState;
  /** Device token to player id. Never sent to clients. */
  tokens: Record<string, string>;
  /** Per device token, the client session and the highest seq applied from it. */
  applied?: Record<string, { session: string; seq: number }>;
}

/** A room written by an older build, brought up to the current game shape. Same object when nothing changed. */
export function upgradeStored(stored: Stored): Stored {
  if (!stored.room.game) return stored;
  const game = upgradeGame(stored.room.game);
  return game === stored.room.game ? stored : { ...stored, room: { ...stored.room, game } };
}

/** In the room now, not just known: a guest who left keeps a token mapping until it is forgotten. */
export function isMember(stored: Stored, token: string): boolean {
  const id = stored.tokens[token];
  return !!id && !!findPlayer(stored.room, id);
}

/**
 * Drop a departed guest's token, so join-and-leave loops cannot grow the
 * stored room without limit. Kept while the current game still lists them, so
 * rejoining mid-game gets their card or claims back.
 */
export function forgetLeaver(stored: Stored, token: string, playerId: string): Stored {
  if (stored.room.game?.players.some((p) => p.id === playerId)) return stored;
  const { [token]: _id, ...tokens } = stored.tokens;
  const { [token]: _applied, ...applied } = stored.applied ?? {};
  return { ...stored, tokens, applied };
}

/** A new round lists only the players in the room, so anyone who left mid-round is forgotten now. */
export function forgetDeparted(stored: Stored): Stored {
  const present = new Set(stored.room.players.map((p) => p.id));
  const keep = Object.entries(stored.tokens).filter(([, id]) => present.has(id));
  const kept = new Set(keep.map(([token]) => token));
  const applied = Object.fromEntries(Object.entries(stored.applied ?? {}).filter(([token]) => kept.has(token)));
  return { ...stored, tokens: Object.fromEntries(keep), applied };
}
