import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import type { Player } from '@shared/types';
import { MAX_NAME_LENGTH, MODE_LABELS } from '@shared/types';
import { canPlayBingo, createBingoGame, createSpotItGame, drawItems, isPackUnlocked, randomSeed, seededRng } from '@game/index';
import { Page } from '@app/components/Page';
import { SettingsForm, type GameSettings } from '@app/components/SettingsForm';
import { useGame } from '@app/store/game';
import { useLastSetup } from '@app/store/lastSetup';
import { usePacks } from '@app/store/packs';

export const MAX_PLAYERS = 8;
export const MAX_BINGO_CARDS = 4;

/** Local, single-phone setup: settings plus the named players who will pass it around. */
export function Setup() {
  const navigate = useNavigate();
  const { start } = useGame();
  const { packs, isLoading } = usePacks();
  const [last, setLast] = useLastSetup();

  const [settings, setSettingsState] = useState<GameSettings>({
    packId: last.packId,
    mode: last.mode,
    listLength: last.listLength,
    pattern: last.pattern,
    approvals: 'auto',
  });
  const setSettings = useCallback((next: GameSettings) => setSettingsState(next), []);
  const [names, setNames] = useState<string[]>(last.playerNames.length ? last.playerNames : ['Player 1']);

  const pack = useMemo(() => packs.find((p) => p.id === settings.packId), [packs, settings.packId]);
  const bingoOk = pack ? canPlayBingo(pack) : false;
  const maxPlayers = settings.mode === 'bingo' ? MAX_BINGO_CARDS : MAX_PLAYERS;
  const visibleNames = names.slice(0, maxPlayers);
  const cleanNames = visibleNames.map((n, i) => n.trim() || `Player ${i + 1}`);
  const canStart = !!pack && isPackUnlocked(pack.id) && visibleNames.length >= 1 && (settings.mode === 'spotit' || bingoOk);

  function begin() {
    if (!pack || !canStart) return;
    const players: Player[] = cleanNames.map((name, i) => ({ id: `p${i + 1}`, name }));
    const rng = seededRng(randomSeed());
    const game =
      settings.mode === 'spotit'
        ? createSpotItGame(players, drawItems(pack.items, settings.listLength, rng))
        : createBingoGame(players, pack.items, settings.pattern, rng);
    setLast({ ...last, packId: pack.id, mode: settings.mode, listLength: settings.listLength, pattern: settings.pattern, playerNames: cleanNames });
    start(game);
    void navigate({ to: settings.mode === 'spotit' ? '/play/called-it' : '/play/bingo', replace: true });
  }

  return (
    <Page title="Set up a game" back="/">
      <SettingsForm packs={packs} isLoading={isLoading} value={settings} onChange={setSettings} />

      <div className="field-label">
        Players{' '}
        <span className="muted small">
          ({settings.mode === 'bingo' ? `up to ${MAX_BINGO_CARDS} cards, pass the phone around` : `up to ${MAX_PLAYERS}`})
        </span>
      </div>
      <div className="stack">
        {visibleNames.map((n, i) => (
          <div className="player-row" key={i}>
            <input
              className="input"
              value={n}
              placeholder={`Player ${i + 1}`}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="off"
              enterKeyHint="next"
              onChange={(e) => setNames((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button
              className="btn btn-icon btn-outline"
              aria-label={`Remove player ${i + 1}`}
              disabled={visibleNames.length <= 1}
              onClick={() => setNames((prev) => prev.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </div>
        ))}
        {visibleNames.length < maxPlayers && (
          <button className="btn btn-outline" onClick={() => setNames((prev) => [...prev, ''])}>
            + Add player
          </button>
        )}
      </div>

      <button className="btn btn-primary btn-big" disabled={!canStart} onClick={begin}>
        Start {MODE_LABELS[settings.mode]}
      </button>
    </Page>
  );
}
