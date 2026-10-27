// Types shared by the client, the pure game module and the Worker.
// Nothing in here may import React or Cloudflare APIs.

export type Mode = 'spotit' | 'bingo';

export const MODE_LABELS: Record<Mode, string> = {
  spotit: 'Called It',
  bingo: 'Bingo',
};

export interface PackItem {
  id: string;
  text: string;
  emoji?: string;
  rarity?: 'common' | 'uncommon' | 'rare';
  region?: string;
}

export interface Pack {
  id: string;
  name: string;
  description: string;
  free: boolean;
  minAge: number;
  items: PackItem[];
  /** True for packs the host created on their device. */
  custom?: boolean;
}

export type ListLength = 'quick' | 'normal' | 'long';

export const LIST_LENGTH_COUNT: Record<ListLength, number | 'all'> = {
  quick: 15,
  normal: 30,
  long: 'all',
};

export type BingoPattern = 'line' | 'corners' | 'x' | 'blackout';

export const BINGO_PATTERN_LABELS: Record<BingoPattern, string> = {
  line: 'Any line',
  corners: 'Four corners',
  x: 'X',
  blackout: 'Blackout',
};

export interface Player {
  id: string;
  name: string;
}

/**
 * A claim on an item in Called It. `pending` is a guest's claim waiting for
 * the host under the "host approves" room setting; everything else is `claimed`.
 */
export interface Claim {
  itemId: string;
  playerId: string;
  at: number;
  status: 'claimed' | 'pending';
}

export type GameStatus = 'playing' | 'ended';

export interface SpotItState {
  mode: 'spotit';
  status: GameStatus;
  players: Player[];
  items: PackItem[];
  claims: Record<string, Claim>;
  endedAt?: number;
}

export const BINGO_SIZE = 5;
export const BINGO_CELLS = BINGO_SIZE * BINGO_SIZE;
export const BINGO_FREE_INDEX = 12;

export interface BingoCard {
  playerId: string;
  /** 25 cells, row-major. Cell 12 is the free square and is null. */
  cells: (PackItem | null)[];
  /** 25 booleans. The free square is always true. */
  marks: boolean[];
}

export interface BingoWin {
  playerId: string;
  at: number;
}

export interface BingoState {
  mode: 'bingo';
  status: GameStatus;
  players: Player[];
  pattern: BingoPattern;
  cards: Record<string, BingoCard>;
  winners: BingoWin[];
  endedAt?: number;
}

export type GameState = SpotItState | BingoState;

export interface Standing {
  player: Player;
  score: number;
  /** 1-based rank; tied players share a rank. */
  rank: number;
}

// ---- Rooms (Phase 2) ----

/** Who approves Called It claims in a room. The host's own claims never wait. */
export type Approvals = 'auto' | 'host';

export const APPROVALS_LABELS: Record<Approvals, string> = {
  auto: 'First tap wins',
  host: 'Host approves each call',
};

export interface RoomSettings {
  mode: Mode;
  listLength: ListLength;
  pattern: BingoPattern;
  approvals: Approvals;
}

export interface RoomPlayer extends Player {
  connected: boolean;
  joinedAt: number;
}

export type RoomStatus = 'lobby' | 'playing' | 'ended' | 'closed';

export const MAX_ROOM_PLAYERS = 12;

/** Longest player name, in characters. Longer names are cut on join. */
export const MAX_NAME_LENGTH = 20;

/**
 * Everything a client needs to render a room. The Durable Object stores this
 * plus a private token map, and broadcasts this whole object after any change.
 */
export interface RoomState {
  code: string;
  status: RoomStatus;
  hostId: string;
  players: RoomPlayer[];
  settings: RoomSettings;
  /** The full pack, so guests never need a custom list locally. */
  pack: Pack;
  game: GameState | null;
  round: number;
  createdAt: number;
  updatedAt: number;
}
