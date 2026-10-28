import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BingoState, GameState, SpotItState } from '@shared/types';
import {
  callBingo,
  claim,
  endBingoGame,
  endSpotItGame,
  reassign,
  toggleMark,
  unclaim,
  upgradeGame,
  type BingoResult,
  type Result,
} from '@game/index';
import { isRecord } from './localStore';

/**
 * The local (single-device) game store. It is a thin wrapper around the pure
 * game functions: every action feeds the current state through one of them
 * and keeps the result. Room play lives in `room.tsx`; both feed the same
 * boards in `components/`.
 */

const GAME_KEY = 'bb:localGame';

function isGameState(v: unknown): v is GameState {
  return isRecord(v) && (v['mode'] === 'spotit' || v['mode'] === 'bingo') && Array.isArray(v['players']);
}

function readGame(): GameState | null {
  try {
    const raw = localStorage.getItem(GAME_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isGameState(parsed) ? upgradeGame(parsed) : null;
  } catch {
    return null;
  }
}

function writeGame(game: GameState | null) {
  try {
    if (game) localStorage.setItem(GAME_KEY, JSON.stringify(game));
    else localStorage.removeItem(GAME_KEY);
  } catch {
    // storage unavailable
  }
}

export type SpotItAction = (s: SpotItState) => Result<SpotItState>;
export type BingoAction = (s: BingoState) => BingoResult;

interface GameApi {
  game: GameState | null;
  start: (game: GameState) => void;
  clear: () => void;
  claim: (itemId: string, playerId: string) => Result<SpotItState>;
  unclaim: (itemId: string, playerId: string) => Result<SpotItState>;
  reassign: (itemId: string, from: string, to: string) => Result<SpotItState>;
  toggleMark: (playerId: string, cell: number) => BingoResult;
  callBingo: (playerId: string) => BingoResult;
  end: () => void;
}

const GameContext = createContext<GameApi | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [game, setGame] = useState<GameState | null>(() => readGame());
  const ref = useRef(game);
  ref.current = game;

  useEffect(() => writeGame(game), [game]);

  const runSpotIt = useCallback((fn: SpotItAction): Result<SpotItState> => {
    const g = ref.current;
    if (!g || g.mode !== 'spotit') return { ok: false, error: 'not-playing' };
    const r = fn(g);
    if (r.ok) {
      ref.current = r.state;
      setGame(r.state);
    }
    return r;
  }, []);

  const runBingo = useCallback((fn: BingoAction): BingoResult => {
    const g = ref.current;
    if (!g || g.mode !== 'bingo') return { ok: false, error: 'not-playing' };
    const r = fn(g);
    if (r.ok) {
      ref.current = r.state;
      setGame(r.state);
    }
    return r;
  }, []);

  const api = useMemo<GameApi>(
    () => ({
      game,
      start: (g) => {
        ref.current = g;
        setGame(g);
      },
      clear: () => {
        ref.current = null;
        setGame(null);
      },
      claim: (itemId, playerId) => runSpotIt((s) => claim(s, itemId, playerId, Date.now())),
      unclaim: (itemId, playerId) => runSpotIt((s) => unclaim(s, itemId, playerId)),
      reassign: (itemId, from, to) => runSpotIt((s) => reassign(s, itemId, from, to)),
      toggleMark: (playerId, cell) => runBingo((s) => toggleMark(s, playerId, cell)),
      callBingo: (playerId) => runBingo((s) => callBingo(s, playerId, Date.now())),
      end: () => {
        const g = ref.current;
        if (!g) return;
        const next = g.mode === 'spotit' ? endSpotItGame(g, Date.now()) : endBingoGame(g, Date.now());
        ref.current = next;
        setGame(next);
      },
    }),
    [game, runSpotIt, runBingo],
  );

  return <GameContext.Provider value={api}>{children}</GameContext.Provider>;
}

export function useGame(): GameApi {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used inside GameProvider');
  return ctx;
}
