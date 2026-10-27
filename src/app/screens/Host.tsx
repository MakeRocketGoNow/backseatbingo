import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { MAX_NAME_LENGTH } from '@shared/types';
import { canPlayBingo, isPackUnlocked } from '@game/index';
import { createRoom } from '@app/api';
import { Page } from '@app/components/Page';
import { SettingsForm, type GameSettings } from '@app/components/SettingsForm';
import { useToast } from '@app/components/Toast';
import { getPlayerToken, useDisplayName } from '@app/store/identity';
import { useLastSetup } from '@app/store/lastSetup';
import { usePacks } from '@app/store/packs';

/** Host setup: name plus game settings, then a room code. Players join from their own phones. */
export function Host() {
  const navigate = useNavigate();
  const toast = useToast();
  const { packs, isLoading } = usePacks();
  const [last, setLast] = useLastSetup();
  const [name, setName] = useDisplayName();
  const [settings, setSettingsState] = useState<GameSettings>({
    packId: last.packId,
    mode: last.mode,
    listLength: last.listLength,
    pattern: last.pattern,
    approvals: last.approvals ?? 'auto',
  });
  const setSettings = useCallback((next: GameSettings) => setSettingsState(next), []);

  const pack = useMemo(() => packs.find((p) => p.id === settings.packId), [packs, settings.packId]);
  const create = useMutation({
    mutationFn: createRoom,
    onSuccess: ({ code }) => {
      setLast({ ...last, ...settings, playerNames: last.playerNames });
      void navigate({ to: '/room/$code', params: { code }, replace: true });
    },
    onError: (e: Error) => toast.show(e.message),
  });

  const trimmed = name.trim();
  const canStart =
    !!pack && isPackUnlocked(pack.id) && trimmed.length > 0 && (settings.mode === 'spotit' || canPlayBingo(pack)) && !create.isPending;

  function begin() {
    if (!pack || !canStart) return;
    create.mutate({
      token: getPlayerToken(),
      name: trimmed,
      settings: { mode: settings.mode, listLength: settings.listLength, pattern: settings.pattern, approvals: settings.approvals },
      pack,
    });
  }

  return (
    <Page title="Start a trip" back="/">
      <label className="field-label" htmlFor="host-name">
        Your name
      </label>
      <input
        id="host-name"
        className="input"
        value={name}
        placeholder="Dad"
        maxLength={MAX_NAME_LENGTH}
        autoComplete="nickname"
        enterKeyHint="done"
        onChange={(e) => setName(e.target.value)}
      />
      <SettingsForm packs={packs} isLoading={isLoading} value={settings} onChange={setSettings} showApprovals />
      <button className="btn btn-primary btn-big" disabled={!canStart} onClick={begin}>
        {create.isPending ? 'Starting…' : 'Get a room code'}
      </button>
      <p className="muted small center">Everyone else joins with the code or a QR link. They do not need the app.</p>
    </Page>
  );
}
