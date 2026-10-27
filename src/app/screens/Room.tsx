import { useState } from 'react';
import { Link, Navigate, useNavigate } from '@tanstack/react-router';
import { MAX_ROOM_PLAYERS } from '@shared/types';
import { BingoBoard } from '@app/components/BingoBoard';
import { CalledItBoard } from '@app/components/CalledItBoard';
import { CloseTripButton } from '@app/components/CloseTripButton';
import { ConnectionBadge } from '@app/components/ConnectionBadge';
import { LeaveButton } from '@app/components/LeaveButton';
import { Page } from '@app/components/Page';
import { SettingsSheet } from '@app/components/SettingsSheet';
import { WinnerView } from '@app/components/WinnerView';
import { useDisplayName } from '@app/store/identity';
import { RoomProvider, useRoom, type CloseReason } from '@app/store/room';
import { Lobby } from './Lobby';

export function RoomRoute({ code }: { code: string }) {
  const [name] = useDisplayName();
  return (
    <RoomProvider code={code} name={name}>
      <RoomScreen />
    </RoomProvider>
  );
}

function RoomScreen() {
  const r = useRoom();

  if (r.needsName) return <Navigate to="/j/$code" params={{ code: r.code }} replace />;
  const youAreHost = !!r.room && r.you === r.room.hostId;
  if (r.closeReason) return <Closed reason={r.closeReason} youAreHost={youAreHost} />;
  if (!r.room) {
    return (
      <Page title="Joining trip" back="/">
        <ConnectionBadge status={r.connection} />
        <div className="notice center">Finding trip {r.code}…</div>
        {r.connection === 'reconnecting' && (
          <Link to="/setup" className="btn btn-outline">
            No signal? Play on this phone instead
          </Link>
        )}
      </Page>
    );
  }

  switch (r.room.status) {
    case 'lobby':
      return <Lobby />;
    case 'playing':
      return <Playing />;
    case 'ended':
      return <RoomWinner />;
    case 'closed':
      return <Closed reason="host-closed" youAreHost={youAreHost} />;
  }
}

function Playing() {
  const { room, you, isHost, connection, send } = useRoom();
  const game = room?.game;
  if (!room || !game) return <Lobby />;
  const badge = <ConnectionBadge status={connection} />;
  const guestAction = !isHost ? <LeaveButton /> : undefined;

  if (game.mode === 'spotit') {
    return (
      <CalledItBoard
        game={game}
        you={you}
        isHost={isHost}
        onClaim={(itemId) => send({ type: 'claim', itemId })}
        onUnclaim={(itemId) => send({ type: 'unclaim', itemId })}
        onReassign={(itemId, playerId) => send({ type: 'reassign', itemId, playerId })}
        onApprove={(itemId) => send({ type: 'approve', itemId })}
        onEnd={isHost ? () => send({ type: 'end' }) : undefined}
        headerExtra={badge}
        headerAction={guestAction}
      />
    );
  }
  return (
    <BingoBoard
      game={game}
      you={you}
      onToggle={(_playerId, cell, marked) => send({ type: marked ? 'mark' : 'unmark', cell })}
      onBingo={() => send({ type: 'bingo' })}
      onEnd={isHost ? () => send({ type: 'end' }) : undefined}
      headerExtra={badge}
      headerAction={guestAction}
    />
  );
}

function RoomWinner() {
  const { room, isHost, connection, send } = useRoom();
  const [nextRound, setNextRound] = useState(false);
  if (!room || !room.game) return <Lobby />;
  const host = room.players.find((p) => p.id === room.hostId);

  return (
    <WinnerView game={room.game} headerExtra={<ConnectionBadge status={connection} />}>
      {isHost ? (
        <>
          <button className="btn btn-primary btn-big" onClick={() => setNextRound(true)}>
            Play again
          </button>
          <CloseTripButton />
          {/* Mounted only while open, so it starts from the room's current settings. */}
          {nextRound && (
            <SettingsSheet
              open
              onClose={() => setNextRound(false)}
              roomPack={room.pack}
              // Called It is the default on "play again".
              initial={{ packId: room.pack.id, ...room.settings, mode: 'spotit' }}
              submitLabel="Start the next round"
              onSubmit={(settings, pack) => {
                send({ type: 'newRound', settings, ...(pack ? { pack } : {}) });
                setNextRound(false);
              }}
            />
          )}
        </>
      ) : (
        <>
          <div className="notice center">Waiting for {host?.name ?? 'the host'} to start another round…</div>
          <Link to="/host" className="btn btn-outline">
            Host your own trip
          </Link>
          <LeaveButton full />
        </>
      )}
    </WinnerView>
  );
}

function closedCopy(reason: NonNullable<CloseReason>, code: string, youAreHost: boolean) {
  switch (reason) {
    case 'left':
      return { title: 'You left', headline: 'You left the trip', sub: 'Thanks for playing.' };
    case 'not-found':
      return { title: 'Trip over', headline: `Trip ${code} has ended`, sub: 'The code no longer works.' };
    case 'full':
      return { title: 'Trip full', headline: `Trip ${code} is full`, sub: `It already has ${MAX_ROOM_PLAYERS} players.` };
    case 'host-closed':
      return youAreHost
        ? { title: 'Trip over', headline: 'Trip closed', sub: 'The code no longer works.' }
        : { title: 'Trip over', headline: 'The host ended the trip', sub: 'Thanks for playing.' };
  }
}

function Closed({ reason, youAreHost }: { reason: NonNullable<CloseReason>; youAreHost: boolean }) {
  const navigate = useNavigate();
  const { code } = useRoom();
  const copy = closedCopy(reason, code, youAreHost);
  return (
    <Page title={copy.title}>
      <div className="hero">
        <h2 className="hero-title">{copy.headline}</h2>
        <p className="hero-sub">{copy.sub}</p>
      </div>
      <div className="btn-stack">
        <button className="btn btn-primary btn-big" onClick={() => void navigate({ to: '/', replace: true })}>
          Home
        </button>
        <Link to="/host" className="btn btn-outline">
          {youAreHost ? 'Start another trip' : 'Host your own trip'}
        </Link>
      </div>
    </Page>
  );
}
