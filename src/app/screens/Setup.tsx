import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import type { BingoPattern, ListLength, Mode, Player } from '@shared/types';
import { BINGO_PATTERN_LABELS, LIST_LENGTH_COUNT, MODE_LABELS } from '@shared/types';
import {
  BINGO_MIN_ITEMS,
  canPlayBingo,
  createBingoGame,
  createSpotItGame,
  drawItems,
  isPackUnlocked,
  randomSeed,
  seededRng,
} from '@game/index';
import { Page } from '@app/components/Page';
import { useGame } from '@app/store/game';
import { useLastSetup } from '@app/store/lastSetup';
import { usePacks } from '@app/store/packs';

export const MAX_PLAYERS = 8;
export const MAX_BINGO_CARDS = 4;

const MODES: Mode[] = ['spotit', 'bingo'];
const LENGTHS: ListLength[] = ['quick', 'normal', 'long'];
const PATTERNS: BingoPattern[] = ['line', 'corners', 'x', 'blackout'];

export function Setup() {
  const navigate = useNavigate();
  const { start } = useGame();
  const { packs, isLoading } = usePacks();
  const [last, setLast] = useLastSetup();

  const [packId, setPackId] = useState(last.packId);
  const [mode, setMode] = useState<Mode>(last.mode);
  const [listLength, setListLength] = useState<ListLength>(last.listLength);
  const [pattern, setPattern] = useState<BingoPattern>(last.pattern);
  const [names, setNames] = useState<string[]>(last.playerNames.length ? last.playerNames : ['Player 1']);

  const pack = useMemo(() => packs.find((p) => p.id === packId), [packs, packId]);

  // If the remembered pack was deleted, fall back to the first available one.
  useEffect(() => {
    if (!isLoading && !pack && packs[0]) setPackId(packs[0].id);
  }, [isLoading, pack, packs]);

  const bingoOk = pack ? canPlayBingo(pack) : false;
  useEffect(() => {
    if (mode === 'bingo' && pack && !bingoOk) setMode('spotit');
  }, [mode, pack, bingoOk]);

  const maxPlayers = mode === 'bingo' ? MAX_BINGO_CARDS : MAX_PLAYERS;
  const visibleNames = names.slice(0, maxPlayers);
  const cleanNames = visibleNames.map((n, i) => n.trim() || `Player ${i + 1}`);
  const canStart = !!pack && isPackUnlocked(pack.id) && visibleNames.length >= 1 && (mode === 'spotit' || bingoOk);

  function setName(i: number, value: string) {
    setNames((prev) => prev.map((n, j) => (j === i ? value : n)));
  }

  function addPlayer() {
    if (names.length >= maxPlayers) return;
    setNames((prev) => [...prev, '']);
  }

  function removePlayer(i: number) {
    setNames((prev) => prev.filter((_, j) => j !== i));
  }

  function begin() {
    if (!pack || !canStart) return;
    const players: Player[] = cleanNames.map((name, i) => ({ id: `p${i + 1}`, name }));
    const rng = seededRng(randomSeed());
    const game =
      mode === 'spotit'
        ? createSpotItGame(players, drawItems(pack.items, listLength, rng))
        : createBingoGame(players, pack.items, pattern, rng);
    setLast({ packId: pack.id, mode, listLength, pattern, playerNames: cleanNames });
    start(game);
    void navigate({ to: mode === 'spotit' ? '/play/called-it' : '/play/bingo', replace: true });
  }

  function lengthLabel(l: ListLength): string {
    const n = LIST_LENGTH_COUNT[l];
    const total = pack?.items.length ?? 0;
    const count = n === 'all' ? total : Math.min(n, total);
    return `${count} item${count === 1 ? '' : 's'}`;
  }

  return (
    <Page title="Set up a game" back="/">
      <div className="field-label">List</div>
      {isLoading ? (
        <div className="notice">Loading lists…</div>
      ) : (
        <div className="choices choices-1" role="radiogroup" aria-label="List">
          {packs.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={p.id === packId}
              className="btn choice"
              onClick={() => setPackId(p.id)}
            >
              <span>
                {p.name}
                {p.custom && <span className="muted small"> · custom</span>}
              </span>
              <span className="btn-sub">
                {p.items.length} items{p.description ? ` · ${p.description}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
      <Link to="/lists" className="btn btn-ghost btn-auto">
        Make your own list
      </Link>

      <div className="field-label">Mode</div>
      <div className="choices" role="radiogroup" aria-label="Mode">
        {MODES.map((m) => {
          const disabled = m === 'bingo' && !bingoOk;
          return (
            <button
              key={m}
              role="radio"
              aria-checked={m === mode}
              aria-disabled={disabled}
              disabled={disabled}
              className="btn choice"
              onClick={() => setMode(m)}
            >
              {MODE_LABELS[m]}
              <span className="btn-sub">
                {m === 'spotit'
                  ? 'First to tap it claims it'
                  : disabled
                    ? `Needs ${BINGO_MIN_ITEMS} items in the list`
                    : 'Fill your card first'}
              </span>
            </button>
          );
        })}
      </div>

      {mode === 'spotit' ? (
        <>
          <div className="field-label">List length</div>
          <div className="choices" role="radiogroup" aria-label="List length">
            {LENGTHS.map((l) => (
              <button
                key={l}
                role="radio"
                aria-checked={l === listLength}
                className="btn choice"
                onClick={() => setListLength(l)}
              >
                {l === 'quick' ? 'Quick' : l === 'normal' ? 'Normal' : 'Long trip'}
                <span className="btn-sub">{lengthLabel(l)}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="field-label">Pattern to win</div>
          <div className="choices" role="radiogroup" aria-label="Pattern">
            {PATTERNS.map((p) => (
              <button
                key={p}
                role="radio"
                aria-checked={p === pattern}
                className="btn choice"
                onClick={() => setPattern(p)}
              >
                {BINGO_PATTERN_LABELS[p]}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="field-label">
        Players{' '}
        <span className="muted small">
          ({mode === 'bingo' ? `up to ${MAX_BINGO_CARDS} cards, pass the phone around` : `up to ${MAX_PLAYERS}`})
        </span>
      </div>
      <div className="stack">
        {visibleNames.map((n, i) => (
          <div className="player-row" key={i}>
            <input
              className="input"
              value={n}
              placeholder={`Player ${i + 1}`}
              maxLength={20}
              autoComplete="off"
              enterKeyHint="next"
              onChange={(e) => setName(i, e.target.value)}
            />
            <button
              className="btn btn-icon btn-outline"
              aria-label={`Remove player ${i + 1}`}
              disabled={visibleNames.length <= 1}
              onClick={() => removePlayer(i)}
            >
              ×
            </button>
          </div>
        ))}
        {visibleNames.length < maxPlayers && (
          <button className="btn btn-outline" onClick={addPlayer}>
            + Add player
          </button>
        )}
      </div>

      <button className="btn btn-primary btn-big" disabled={!canStart} onClick={begin}>
        Start {MODE_LABELS[mode]}
      </button>
    </Page>
  );
}
