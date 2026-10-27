import { useMemo, useState } from 'react';
import type { Pack } from '@shared/types';
import { usePacks } from '@app/store/packs';
import { SettingsForm, type GameSettings } from './SettingsForm';
import { Sheet } from './Sheet';

interface SettingsSheetProps {
  open: boolean;
  onClose: () => void;
  roomPack: Pack;
  initial: GameSettings;
  submitLabel: string;
  onSubmit: (settings: Omit<GameSettings, 'packId'>, pack: Pack | undefined) => void;
}

/** Host changes settings (lobby) or picks the next round (winner). The host's local packs are offered alongside the room's. */
export function SettingsSheet({ open, onClose, roomPack, initial, submitLabel, onSubmit }: SettingsSheetProps) {
  const { packs, isLoading } = usePacks();
  const [value, setValue] = useState<GameSettings>(initial);
  const options = useMemo(() => (packs.some((p) => p.id === roomPack.id) ? packs : [roomPack, ...packs]), [packs, roomPack]);
  const chosen = options.find((p) => p.id === value.packId);

  return (
    <Sheet open={open} title="Game settings" onClose={onClose}>
      <SettingsForm packs={options} isLoading={isLoading} value={value} onChange={setValue} showApprovals hideListLink />
      <button
        className="btn btn-primary btn-big"
        disabled={!chosen}
        onClick={() => {
          if (!chosen) return;
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
