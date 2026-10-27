import { useState } from 'react';
import { APPROVALS_LABELS, BINGO_PATTERN_LABELS, MODE_LABELS } from '@shared/types';
import { listItemCount } from '@game/index';
import { joinLink } from '@app/api';
import { CloseTripButton } from '@app/components/CloseTripButton';
import { ConnectionBadge } from '@app/components/ConnectionBadge';
import { LeaveButton } from '@app/components/LeaveButton';
import { Page } from '@app/components/Page';
import { QrCode } from '@app/components/QrCode';
import { SettingsSheet } from '@app/components/SettingsSheet';
import { useToast } from '@app/components/Toast';
import { useRoom } from '@app/store/room';

/** Room code large, QR, player list, Start for the host, "waiting" for guests. */
export function Lobby() {
  const { room, you, isHost, connection, send, code } = useRoom();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
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
        <div className="code-big">
          <span aria-hidden="true">{code}</span>
          {/* Spaced out so screen readers spell the code instead of reading it as a word. */}
          <span className="visually-hidden">{code.split('').join(' ')}</span>
        </div>
      </div>
      <div className="center">
        <QrCode text={link} />
      </div>
      <p className="muted small center break-anywhere">
        {link}
      </p>
      <button className="btn btn-outline" onClick={() => void share()}>
        Share the link
      </button>

      <h2 className="field-label">Players ({room.players.length})</h2>
      <ul className="player-list">
        {room.players.map((p) => (
          <li key={p.id} className="player-item">
            <span className={`dot ${p.connected ? 'dot-on' : 'dot-off'}`} aria-hidden="true" />
            <span className="grow">
              {p.name}
              <span className="visually-hidden">{p.connected ? ', connected' : ', offline'}</span>
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
            <button className="btn btn-ghost btn-auto btn-flush" onClick={() => setEditing(true)}>
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
          <CloseTripButton />
        </div>
      ) : (
        <div className="notice center">Waiting for {host?.name ?? 'the host'} to start…</div>
      )}

      {/* Mounted only while open, so every opening starts from the room's current settings. */}
      {isHost && editing && (
        <SettingsSheet
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
    </Page>
  );
}
