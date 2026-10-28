import { useEffect, useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import type { Approvals, BingoPattern, ListLength, Mode, Pack } from '@shared/types';
import { APPROVALS_LABELS, BINGO_PATTERN_LABELS, MODE_LABELS } from '@shared/types';
import { BINGO_MIN_ITEMS, canPlayBingo, listItemCount } from '@game/index';

export interface GameSettings {
  packId: string;
  mode: Mode;
  listLength: ListLength;
  pattern: BingoPattern;
  approvals: Approvals;
}

interface SettingsFormProps {
  packs: Pack[];
  isLoading?: boolean;
  value: GameSettings;
  onChange: (next: GameSettings) => void;
  /** Rooms only: who approves Called It claims. */
  showApprovals?: boolean;
  /** Hide the "make your own list" link (inside a room, custom lists are picked before creating it). */
  hideListLink?: boolean;
}

const MODES: Mode[] = ['spotit', 'bingo'];
const LENGTHS: ListLength[] = ['quick', 'normal', 'long'];
const PATTERNS: BingoPattern[] = ['line', 'corners', 'x', 'blackout'];
const APPROVALS: Approvals[] = ['auto', 'host'];

/** Pack, mode, list length or pattern, and (in rooms) approvals. Shared by local Setup, Host and new rounds. */
export function SettingsForm({ packs, isLoading, value, onChange, showApprovals, hideListLink }: SettingsFormProps) {
  const pack = useMemo(() => packs.find((p) => p.id === value.packId), [packs, value.packId]);
  const bingoOk = pack ? canPlayBingo(pack) : false;

  // If the remembered pack is gone, fall back to the first one. If the pack
  // is too small for Bingo, fall back to Called It.
  useEffect(() => {
    if (!isLoading && !pack && packs[0]) onChange({ ...value, packId: packs[0].id });
  }, [isLoading, pack, packs, value, onChange]);
  useEffect(() => {
    if (value.mode === 'bingo' && pack && !bingoOk) onChange({ ...value, mode: 'spotit' });
  }, [value, pack, bingoOk, onChange]);

  function lengthLabel(l: ListLength): string {
    const count = listItemCount(pack?.items.length ?? 0, l);
    return `${count} item${count === 1 ? '' : 's'}`;
  }

  return (
    <>
      <div className="field-label">List</div>
      {isLoading ? (
        <div className="notice">Loading lists…</div>
      ) : (
        <div className="choices choices-1" role="radiogroup" aria-label="List">
          {packs.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={p.id === value.packId}
              className="btn choice"
              onClick={() => onChange({ ...value, packId: p.id })}
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
      {!hideListLink && (
        <Link to="/lists" className="btn btn-ghost btn-auto">
          Make your own list
        </Link>
      )}

      <div className="field-label">Mode</div>
      <div className="choices" role="radiogroup" aria-label="Mode">
        {MODES.map((m) => {
          const disabled = m === 'bingo' && !bingoOk;
          return (
            <button
              key={m}
              role="radio"
              aria-checked={m === value.mode}
              aria-disabled={disabled}
              disabled={disabled}
              className="btn choice"
              onClick={() => onChange({ ...value, mode: m })}
            >
              {MODE_LABELS[m]}
              <span className="btn-sub">
                {m === 'spotit' ? 'Everyone hunts the same list' : disabled ? `Needs ${BINGO_MIN_ITEMS} items in the list` : 'Fill your card first'}
              </span>
            </button>
          );
        })}
      </div>

      {value.mode === 'spotit' ? (
        <>
          <div className="field-label">List length</div>
          <div className="choices" role="radiogroup" aria-label="List length">
            {LENGTHS.map((l) => (
              <button
                key={l}
                role="radio"
                aria-checked={l === value.listLength}
                className="btn choice"
                onClick={() => onChange({ ...value, listLength: l })}
              >
                {l === 'quick' ? 'Quick' : l === 'normal' ? 'Normal' : 'Long trip'}
                <span className="btn-sub">{lengthLabel(l)}</span>
              </button>
            ))}
          </div>
          {showApprovals && (
            <>
              <div className="field-label">Calls</div>
              <div className="choices" role="radiogroup" aria-label="Calls">
                {APPROVALS.map((a) => (
                  <button
                    key={a}
                    role="radio"
                    aria-checked={a === value.approvals}
                    className="btn choice"
                    onClick={() => onChange({ ...value, approvals: a })}
                  >
                    {APPROVALS_LABELS[a]}
                    <span className="btn-sub">{a === 'auto' ? 'You can still undo any call' : 'Each call waits for your OK'}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <div className="field-label">Pattern to win</div>
          <div className="choices" role="radiogroup" aria-label="Pattern">
            {PATTERNS.map((p) => (
              <button
                key={p}
                role="radio"
                aria-checked={p === value.pattern}
                className="btn choice"
                onClick={() => onChange({ ...value, pattern: p })}
              >
                {BINGO_PATTERN_LABELS[p]}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
