import { useMemo, useState } from 'react';
import type { Pack } from '@shared/types';
import { isRoomPack } from '@shared/validate';
import { usePacks } from '@app/store/packs';
import { SettingsForm, type GameSettings } from './SettingsForm';
import { Sheet } from './Sheet';
import { TooBigForTrip } from './TooBigForTrip';

interface SettingsSheetProps {
  onClose: () => void;
  roomPack: Pack;
  initial: GameSettings;
  submitLabel: string;
  onSubmit: (settings: Omit<GameSettings, 'packId'>, pack: Pack | undefined) => void;
}

/**
 * Host changes settings (lobby) or picks the next round (winner). The host's local packs are offered alongside the room's.
 * Render it only while it should show: it reads `initial` once, so each mount starts from the room's current settings.
 */
export function SettingsSheet({ onClose, roomPack, initial, submitLabel, onSubmit }: SettingsSheetProps) {
  const { packs, isLoading } = usePacks();
  const [value, setValue] = useState<GameSettings>(initial);
  const options = useMemo(() => (packs.some((p) => p.id === roomPack.id) ? packs : [roomPack, ...packs]), [packs, roomPack]);
  const chosen = options.find((p) => p.id === value.packId);
  // A local list saved before the size caps can be too big; the room would refuse it with no reason given.
  const fits = !!chosen && isRoomPack(chosen);

  return (
    <Sheet open title="Game settings" onClose={onClose}>
      <SettingsForm packs={options} isLoading={isLoading} value={value} onChange={setValue} showApprovals hideListLink />
      {chosen && !fits && <TooBigForTrip />}
      <button
        className="btn btn-primary btn-big"
        disabled={!fits}
        onClick={() => {
          if (!chosen || !fits) return;
          const { packId, ...rest } = value;
          onSubmit(rest, packId === roomPack.id ? undefined : chosen);
        }}
      >
        {submitLabel}
      </button>
      <button className="btn btn-ghost" onClick={onClose}>
        Cancel
      </button>
    </Sheet>
  );
}
