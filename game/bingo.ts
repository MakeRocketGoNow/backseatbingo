import type { BingoCard, BingoPattern, BingoState, PackItem, Player, Standing } from '../shared/types';
import { BINGO_CELLS, BINGO_FREE_INDEX, BINGO_SIZE } from '../shared/types';
import type { Rng } from './rng';
import { sample } from './rng';
import { BINGO_MIN_ITEMS } from './pack';

export type BingoError =
  | 'not-playing'
  | 'unknown-player'
  | 'not-enough-items'
  | 'bad-cell'
  | 'pattern-not-met'
  | 'already-won';

export type BingoResult = { ok: true; state: BingoState } | { ok: false; error: BingoError };

export function generateCard(playerId: string, items: readonly PackItem[], rng: Rng): BingoCard {
  if (items.length < BINGO_MIN_ITEMS) {
    throw new Error(`Bingo needs at least ${BINGO_MIN_ITEMS} items, got ${items.length}`);
  }
  const picked = sample(items, BINGO_MIN_ITEMS, rng);
  const cells: (PackItem | null)[] = [];
  const marks: boolean[] = [];
  let p = 0;
  for (let i = 0; i < BINGO_CELLS; i++) {
    if (i === BINGO_FREE_INDEX) {
      cells.push(null);
      marks.push(true);
    } else {
      cells.push(picked[p++] as PackItem);
      marks.push(false);
    }
  }
  return { playerId, cells, marks };
}

export function createBingoGame(
  players: Player[],
  items: readonly PackItem[],
  pattern: BingoPattern,
  rng: Rng,
): BingoState {
  const cards: Record<string, BingoCard> = {};
  for (const player of players) cards[player.id] = generateCard(player.id, items, rng);
  return { mode: 'bingo', status: 'playing', players, pattern, cards, winners: [] };
}

const idx = (row: number, col: number): number => row * BINGO_SIZE + col;

function allMarked(marks: readonly boolean[], cells: readonly number[]): boolean {
  return cells.every((c) => marks[c] === true);
}

export function patternLines(pattern: BingoPattern): number[][] {
  const rows = Array.from({ length: BINGO_SIZE }, (_, r) =>
    Array.from({ length: BINGO_SIZE }, (_, c) => idx(r, c)),
  );
  const cols = Array.from({ length: BINGO_SIZE }, (_, c) =>
    Array.from({ length: BINGO_SIZE }, (_, r) => idx(r, c)),
  );
  const diag1 = Array.from({ length: BINGO_SIZE }, (_, i) => idx(i, i));
  const diag2 = Array.from({ length: BINGO_SIZE }, (_, i) => idx(i, BINGO_SIZE - 1 - i));
  switch (pattern) {
    case 'line':
      return [...rows, ...cols, diag1, diag2];
    case 'corners':
      return [[idx(0, 0), idx(0, BINGO_SIZE - 1), idx(BINGO_SIZE - 1, 0), idx(BINGO_SIZE - 1, BINGO_SIZE - 1)]];
    case 'x':
      return [Array.from(new Set([...diag1, ...diag2]))];
    case 'blackout':
      return [Array.from({ length: BINGO_CELLS }, (_, i) => i)];
  }
}

/** Cells that complete the pattern, or null if it is not met. */
export function winningCells(marks: readonly boolean[], pattern: BingoPattern): number[] | null {
  for (const line of patternLines(pattern)) {
    if (allMarked(marks, line)) return line;
  }
  return null;
}

export function hasPattern(marks: readonly boolean[], pattern: BingoPattern): boolean {
  return winningCells(marks, pattern) !== null;
}

export function toggleMark(state: BingoState, playerId: string, cell: number): BingoResult {
  if (state.status !== 'playing') return { ok: false, error: 'not-playing' };
  const card = state.cards[playerId];
  if (!card) return { ok: false, error: 'unknown-player' };
  if (!Number.isInteger(cell) || cell < 0 || cell >= BINGO_CELLS || cell === BINGO_FREE_INDEX) {
    return { ok: false, error: 'bad-cell' };
  }
  const marks = card.marks.slice();
  marks[cell] = !marks[cell];
  return { ok: true, state: { ...state, cards: { ...state.cards, [playerId]: { ...card, marks } } } };
}

/** Player calls bingo. Verified against the stored card and marks. */
export function callBingo(state: BingoState, playerId: string, at: number): BingoResult {
  if (state.status !== 'playing') return { ok: false, error: 'not-playing' };
  const card = state.cards[playerId];
  if (!card) return { ok: false, error: 'unknown-player' };
  if (state.winners.some((w) => w.playerId === playerId)) return { ok: false, error: 'already-won' };
  if (!hasPattern(card.marks, state.pattern)) return { ok: false, error: 'pattern-not-met' };
  const winners = [...state.winners, { playerId, at }];
  const next: BingoState = { ...state, winners };
  const everyoneWon = state.players.every((p) => winners.some((w) => w.playerId === p.id));
  return { ok: true, state: everyoneWon ? endBingoGame(next, at) : next };
}

export function endBingoGame(state: BingoState, at: number): BingoState {
  if (state.status === 'ended') return state;
  return { ...state, status: 'ended', endedAt: at };
}

/**
 * Standings: winners in the order they called bingo, then everyone else
 * ranked by how many squares they marked (free square excluded).
 */
export function bingoStandings(state: BingoState): Standing[] {
  const out: Standing[] = [];
  state.winners.forEach((w, i) => {
    const player = state.players.find((p) => p.id === w.playerId);
    if (player) out.push({ player, score: markedCount(state.cards[player.id]), rank: i + 1 });
  });
  const rest = state.players
    .filter((p) => !state.winners.some((w) => w.playerId === p.id))
    .map((player) => ({ player, score: markedCount(state.cards[player.id]) }))
    .sort((a, b) => b.score - a.score);
  let rank = out.length + 1;
  rest.forEach((s, i) => {
    const prev = rest[i - 1];
    if (!prev || prev.score !== s.score) rank = out.length + i + 1;
    out.push({ ...s, rank });
  });
  return out;
}

export function markedCount(card: BingoCard | undefined): number {
  if (!card) return 0;
  return card.marks.filter((m, i) => m && i !== BINGO_FREE_INDEX).length;
}
