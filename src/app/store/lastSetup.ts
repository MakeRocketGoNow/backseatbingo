import type { Approvals, BingoPattern, ListLength, Mode } from '@shared/types';
import { createLocalStore, isRecord } from './localStore';

/** What the host picked last time, so Setup and "play again" start from it. */
export interface LastSetup {
  packId: string;
  mode: Mode;
  listLength: ListLength;
  pattern: BingoPattern;
  playerNames: string[];
  /** Rooms only. Optional so setups saved before Phase 2 still validate. */
  approvals?: Approvals;
}

export const DEFAULT_SETUP: LastSetup = {
  packId: 'family',
  mode: 'spotit',
  listLength: 'normal',
  pattern: 'line',
  playerNames: ['Player 1', 'Player 2'],
  approvals: 'auto',
};

export const lastSetupStore = createLocalStore<LastSetup>(
  'bb:lastSetup',
  DEFAULT_SETUP,
  (v): v is LastSetup =>
    isRecord(v) &&
    typeof v['packId'] === 'string' &&
    (v['mode'] === 'spotit' || v['mode'] === 'bingo') &&
    typeof v['listLength'] === 'string' &&
    typeof v['pattern'] === 'string' &&
    Array.isArray(v['playerNames']),
);

export const useLastSetup = lastSetupStore.use;
