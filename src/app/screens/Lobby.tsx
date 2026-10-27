import { useCallback, useMemo, useState } from 'react';
import type { Pack } from '@shared/types';
import { APPROVALS_LABELS, BINGO_PATTERN_LABELS, MODE_LABELS } from '@shared/types';
import { listItemCount } from '@game/index';
import { joinLink } from '@app/api';
import { ConnectionBadge } from '@app/components/ConnectionBadge';
import { Page } from '@app/components/Page';
import { QrCode } from '@app/components/QrCode';
import { SettingsForm, type GameSettings } from '@app/components/SettingsForm';
import { Sheet } from '@app/components/Sheet';
import { useToast } from '@app/components/Toast';
import { usePacks } from '@app/store/packs';
import { useRoom } from '@app/store/room';
import { LeaveButton } from './Room';

/** Room code large, QR, player list, Start for the host, "waiting" for guests. */
export function Lobby() {
  const { room, you, isHost, connection, send, code } = useRoom();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const link = joinLink(code);

  if (!room) return null;
  const host = room.players.find((p) => p.id === room.hostId);
  const s = room.settings;
  const detail =
    s.mode === 'spotit'
      ? `${listItemCount(room.pack.items.length, s.listLength)} items · ${APPROVALS_LABELS[s.approvals]}`
      : BINGO_PATTERN_LABELS[s.pattern];

  async function share() {
    const data = { title: 'Backseat Bingo', text: `Join my trip. Code ${code}`, url: link };
    try {
      if (navigator.share) {
        await navigator.share(data);
        return;
      }
    } catch {
      // user cancelled the sheet
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      toast.show('Link copied');
    } catch {
      toast.show(link);
    }
  }

  return (
    <Page title="Trip lobby" back={isHost ? undefined : '/'} actions={!isHost ? <LeaveButton /> : undefined}>
      <ConnectionBadge status={connection} />
      <div className="code-box">
        <div className="code-label">Room code</div>
        <div className="code-big" aria-label={`Room code ${code.split('').join(' ')}`}>
          {code}
        </div>
      </div>
      <div className="center">
        <QrCode text={link} />
      </div>
      <p className="muted small center" style={{ overflowWrap: 'anywhere' }}>
        {link}
      </p>
      <button className="btn btn-outline" onClick={() => void share()}>
        Share the link
      </button>

      <h2 className="field-label">Players ({room.players.length})</h2>
      <ul className="player-list">
        {room.players.map((p) => (
          <li key={p.id} className="player-item">
            <span className={`dot ${p.connected ? 'dot-on' : 'dot-off'}`} aria-label={p.connected ? 'connected' : 'offline'} />
            <span className="grow">
              {p.name}
              {p.id === you && <span className="muted small"> (you)</span>}
            </span>
            {p.id === room.hostId && <span className="tag">host</span>}
          </li>
        ))}
      </ul>

      <div className="notice">
        <strong>{MODE_LABELS[s.mode]}</strong> · {detail}
        <br />
        <span className="small">{room.pack.name}</span>
        {isHost && (
          <>
            <br />
            <button className="btn btn-ghost btn-auto" style={{ paddingLeft: 0 }} onClick={() => setEditing(true)}>
              Change
            </button>
          </>
        )}
      </div>

      {isHost ? (
        <div className="btn-stack">
          <button className="btn btn-primary btn-big" onClick={() => send({ type: 'start' })}>
            Start {MODE_LABELS[s.mode]}
          </button>
          <p className="muted small center">Latecomers can still join after you start.</p>
          <button className="btn btn-ghost" onClick={() => setConfirmClose(true)}>
            Close the trip
          </button>
        </div>
      ) : (
        <div className="notice center">Waiting for {host?.name ?? 'the host'} to start…</div>
      )}

      {/* Mounted only while open, so every opening starts from the room's current settings. */}
      {isHost && editing && (
        <SettingsSheet
          open
          onClose={() => setEditing(false)}
          roomPack={room.pack}
          initial={{ packId: room.pack.id, ...s }}
          submitLabel="Save"
          onSubmit={(settings, pack) => {
            send({ type: 'settings', settings, ...(pack ? { pack } : {}) });
            setEditing(false);
          }}
        />
      )}

      <Sheet open={confirmClose} title="Close the trip?" onClose={() => setConfirmClose(false)}>
        <p className="muted center">Everyone will be sent home. The code stops working.</p>
        <button className="btn btn-danger" onClick={() => send({ type: 'close' })}>
          Close the trip
        </button>
        <button className="btn btn-ghost" onClick={() => setConfirmClose(false)}>
          Keep it open
        </button>
      </Sheet>
    </Page>
  );
}

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
  const [value, setValueState] = useState<GameSettings>(initial);
  const setValue = useCallback((next: GameSettings) => setValueState(next), []);
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
