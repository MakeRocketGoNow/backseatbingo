import { describe, expect, it } from 'vitest';
import type { BingoPattern, PackItem, Player } from '../shared/types';
import { BINGO_CELLS, BINGO_FREE_INDEX } from '../shared/types';
import {
  addBingoPlayer,
  bingoStandings,
  callBingo,
  createBingoGame,
  endBingoGame,
  generateCard,
  hasPattern,
  markedCount,
  patternLines,
  toggleMark,
  winningCells,
} from './bingo';
import { seededRng } from './rng';

const items: PackItem[] = Array.from({ length: 40 }, (_, i) => ({ id: `i${i}`, text: `Item ${i}` }));
const players: Player[] = [
  { id: 'p1', name: 'Mom' },
  { id: 'p2', name: 'Dad' },
];

function marksFor(cells: number[]): boolean[] {
  const marks = Array.from({ length: BINGO_CELLS }, () => false);
  marks[BINGO_FREE_INDEX] = true;
  for (const c of cells) marks[c] = true;
  return marks;
}

describe('card generation', () => {
  it('makes 25 cells with a free center and 24 distinct items', () => {
    const card = generateCard('p1', items, seededRng(1));
    expect(card.cells).toHaveLength(25);
    expect(card.cells[BINGO_FREE_INDEX]).toBeNull();
    expect(card.marks[BINGO_FREE_INDEX]).toBe(true);
    const ids = card.cells.filter((c): c is PackItem => c !== null).map((c) => c.id);
    expect(ids).toHaveLength(24);
    expect(new Set(ids).size).toBe(24);
    expect(card.marks.filter(Boolean)).toHaveLength(1);
  });

  it('is deterministic for a seed and differs across seeds', () => {
    const a = generateCard('p1', items, seededRng(7));
    const b = generateCard('p1', items, seededRng(7));
    const c = generateCard('p1', items, seededRng(8));
    expect(a.cells).toEqual(b.cells);
    expect(a.cells).not.toEqual(c.cells);
  });

  it('refuses packs with fewer than 24 items', () => {
    expect(() => generateCard('p1', items.slice(0, 23), seededRng(1))).toThrow(/24/);
  });

  it('creates one card per player', () => {
    const g = createBingoGame(players, items, 'line', seededRng(3));
    expect(Object.keys(g.cards)).toEqual(['p1', 'p2']);
    expect(g.cards['p1']?.cells).not.toEqual(g.cards['p2']?.cells);
  });
});

describe('pattern checks', () => {
  const row0 = [0, 1, 2, 3, 4];
  const col4 = [4, 9, 14, 19, 24];
  const diag = [0, 6, 18, 24]; // 12 is free
  const anti = [4, 8, 16, 20];
  const corners = [0, 4, 20, 24];

  it('line: any row, column or diagonal', () => {
    expect(hasPattern(marksFor(row0), 'line')).toBe(true);
    expect(hasPattern(marksFor(col4), 'line')).toBe(true);
    expect(hasPattern(marksFor(diag), 'line')).toBe(true);
    expect(hasPattern(marksFor(anti), 'line')).toBe(true);
    expect(hasPattern(marksFor([0, 1, 2, 3]), 'line')).toBe(false);
    expect(hasPattern(marksFor(corners), 'line')).toBe(false);
  });

  it('the free center counts toward middle row, column and diagonals', () => {
    expect(hasPattern(marksFor([10, 11, 13, 14]), 'line')).toBe(true);
    expect(hasPattern(marksFor([2, 7, 17, 22]), 'line')).toBe(true);
  });

  it('corners', () => {
    expect(hasPattern(marksFor(corners), 'corners')).toBe(true);
    expect(hasPattern(marksFor([0, 4, 20]), 'corners')).toBe(false);
    expect(hasPattern(marksFor(row0), 'corners')).toBe(false);
  });

  it('x needs both diagonals', () => {
    expect(hasPattern(marksFor(diag), 'x')).toBe(false);
    expect(hasPattern(marksFor([...diag, ...anti]), 'x')).toBe(true);
  });

  it('blackout needs every square', () => {
    const all = Array.from({ length: BINGO_CELLS }, (_, i) => i);
    expect(hasPattern(marksFor(all), 'blackout')).toBe(true);
    expect(hasPattern(marksFor(all.filter((i) => i !== 3)), 'blackout')).toBe(false);
  });

  it('winningCells returns the completed cells', () => {
    expect(winningCells(marksFor(row0), 'line')).toEqual(row0);
    expect(winningCells(marksFor([1]), 'line')).toBeNull();
  });

  it('line has 12 candidate lines', () => {
    expect(patternLines('line')).toHaveLength(12);
    for (const p of ['corners', 'x', 'blackout'] as BingoPattern[]) {
      expect(patternLines(p)).toHaveLength(1);
    }
  });
});

describe('marking and calling bingo', () => {
  function game(pattern: BingoPattern = 'line') {
    return createBingoGame(players, items, pattern, seededRng(11));
  }

  it('toggles a mark on and off', () => {
    const r1 = toggleMark(game(), 'p1', 0);
    if (!r1.ok) throw new Error(r1.error);
    expect(r1.state.cards['p1']?.marks[0]).toBe(true);
    const r2 = toggleMark(r1.state, 'p1', 0);
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.state.cards['p1']?.marks[0]).toBe(false);
    expect(r2.state.cards['p2']?.marks[0]).toBe(false);
  });

  it('rejects the free square, out-of-range cells and unknown players', () => {
    expect(toggleMark(game(), 'p1', BINGO_FREE_INDEX)).toEqual({ ok: false, error: 'bad-cell' });
    expect(toggleMark(game(), 'p1', 25)).toEqual({ ok: false, error: 'bad-cell' });
    expect(toggleMark(game(), 'p1', -1)).toEqual({ ok: false, error: 'bad-cell' });
    expect(toggleMark(game(), 'nope', 1)).toEqual({ ok: false, error: 'unknown-player' });
  });

  it('bingo is verified against the stored marks', () => {
    let s = game();
    expect(callBingo(s, 'p1', 1)).toEqual({ ok: false, error: 'pattern-not-met' });
    for (const c of [0, 1, 2, 3, 4]) {
      const r = toggleMark(s, 'p1', c);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    const win = callBingo(s, 'p1', 5);
    expect(win.ok).toBe(true);
    if (!win.ok) return;
    expect(win.state.winners).toEqual([{ playerId: 'p1', at: 5 }]);
    expect(win.state.status).toBe('playing');
    expect(callBingo(win.state, 'p1', 6)).toEqual({ ok: false, error: 'already-won' });
  });

  it('ends when every player has bingo, or when the host ends it', () => {
    let s = game('corners');
    for (const p of ['p1', 'p2']) {
      for (const c of [0, 4, 20, 24]) {
        const r = toggleMark(s, p, c);
        if (!r.ok) throw new Error(r.error);
        s = r.state;
      }
      const w = callBingo(s, p, 1);
      if (!w.ok) throw new Error(w.error);
      s = w.state;
    }
    expect(s.status).toBe('ended');
    expect(s.winners.map((w) => w.playerId)).toEqual(['p1', 'p2']);
    expect(toggleMark(s, 'p1', 1)).toEqual({ ok: false, error: 'not-playing' });

    const ended = endBingoGame(game(), 9);
    expect(ended.status).toBe('ended');
    expect(callBingo(ended, 'p1', 10)).toEqual({ ok: false, error: 'not-playing' });
  });

  it('standings list winners first then by marked count', () => {
    let s = game();
    for (const c of [0, 1, 2, 3, 4]) {
      const r = toggleMark(s, 'p2', c);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    const w = callBingo(s, 'p2', 1);
    if (!w.ok) throw new Error(w.error);
    const r = toggleMark(w.state, 'p1', 7);
    if (!r.ok) throw new Error(r.error);
    const standings = bingoStandings(r.state);
    expect(standings.map((x) => [x.player.id, x.score, x.rank])).toEqual([
      ['p2', 5, 1],
      ['p1', 1, 2],
    ]);
    expect(markedCount(r.state.cards['p1'])).toBe(1);
  });
});

describe('late joiners', () => {
  it('addBingoPlayer deals a card and is idempotent', () => {
    const g = createBingoGame(players, items, 'line', seededRng(3));
    const g2 = addBingoPlayer(g, { id: 'p3', name: 'Late' }, items, seededRng(4));
    expect(g2.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(g2.cards['p3']?.cells).toHaveLength(25);
    expect(addBingoPlayer(g2, { id: 'p3', name: 'Late' }, items, seededRng(5))).toBe(g2);
    expect(toggleMark(g2, 'p3', 0).ok).toBe(true);
  });
});
