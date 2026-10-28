import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import type { Claim, PackItem, Player, SpotItState } from '@shared/types';
import { CLAIM_WINDOW_MS, claimBy, claimsOn, recentCall, remainingFor, spotItStandings } from '@game/index';
import { claimFeedback } from '@app/feedback';
import { Page } from './Page';
import { Scoreboard } from './Scoreboard';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

export interface CalledItBoardProps {
  game: SpotItState;
  /** The viewer's player id in a room, or null on a shared phone where each tap picks who called it. */
  you: string | null;
  /** Host controls: undo, reassign, approve, end. */
  isHost: boolean;
  onClaim: (itemId: string, playerId: string) => void;
  onUnclaim: (itemId: string, playerId: string) => void;
  onReassign: (itemId: string, from: string, to: string) => void;
  onApprove?: (itemId: string, playerId: string) => void;
  /** When present, the header shows an End button that confirms before calling it. */
  onEnd?: () => void;
  /** Rendered under the header, above the scoreboard (connection badge in rooms). */
  headerExtra?: ReactNode;
  /** Rendered in the header's action slot when there is no End button (guest controls). */
  headerAction?: ReactNode;
}

type SheetState =
  | { kind: 'none' }
  /** Who has the item and who can still call it. `reassigning` is the player whose call is being handed over. */
  | { kind: 'item'; item: PackItem; reassigning: string | null }
  | { kind: 'end' };

/**
 * The time, re-read when the next claim window closes so a greyed chip opens
 * again without anyone tapping.
 */
function useClaimClock(game: SpotItState): number {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const now = Date.now();
  let next = Infinity;
  for (const claims of Object.values(game.claims)) {
    for (const c of claims) {
      const until = c.at + CLAIM_WINDOW_MS;
      if (until > now && until < next) next = until;
    }
  }
  useEffect(() => {
    if (next === Infinity) return;
    const id = window.setTimeout(tick, Math.max(0, next - Date.now()) + 50);
    return () => window.clearTimeout(id);
  }, [next]);
  return now;
}

export function CalledItBoard(props: CalledItBoardProps) {
  const { game, you, isHost, onClaim, onUnclaim, onReassign, onApprove, onEnd, headerExtra, headerAction } = props;
  const toast = useToast();
  const [sheet, setSheet] = useState<SheetState>({ kind: 'none' });
  const standings = useMemo(() => spotItStandings(game), [game]);
  const playing = game.status === 'playing';
  const now = useClaimClock(game);

  const playerById = (id: string): Player | undefined => game.players.find((p) => p.id === id);
  const nameOf = (id: string): string => playerById(id)?.name ?? 'Someone';
  // People who left the trip keep their score but cannot be handed a call.
  const active = game.players.filter((p) => !p.left);
  // Whose list this phone tracks: you in a room, or the one name on a shared phone. Null when a shared phone has several.
  const self = you ?? (active.length === 1 ? active[0]?.id : undefined) ?? null;
  const uncalled = game.items.filter((i) => claimsOn(game, i.id).length === 0).length;

  function close() {
    setSheet({ kind: 'none' });
  }

  function doClaim(item: PackItem, playerId: string) {
    claimFeedback();
    onClaim(item.id, playerId);
    close();
  }

  function onChipTap(item: PackItem) {
    const claims = claimsOn(game, item.id);
    // The host manages calls from the sheet; on a shared phone every tap picks who called it.
    if (isHost && (claims.length > 0 || !you)) {
      if (!you && claims.length === 0 && self) return playing ? doClaim(item, self) : undefined;
      setSheet({ kind: 'item', item, reassigning: null });
      return;
    }
    if (!playing || !you) return;
    const mine = claimBy(game, item.id, you);
    if (mine) {
      toast.show(mine.status === 'pending' ? 'Waiting for the host to OK it' : 'You already called that one');
      return;
    }
    const recent = recentCall(game, item.id, now);
    if (recent) {
      toast.show(`${nameOf(recent.playerId)} just called it`);
      return;
    }
    doClaim(item, you);
  }

  function doUndo(item: PackItem, c: Claim) {
    onUnclaim(item.id, c.playerId);
    toast.show(`${nameOf(c.playerId)} ${c.status === 'pending' ? 'does not get' : 'loses'} "${item.text}"`);
    close();
  }

  function doReassign(item: PackItem, from: string, to: Player) {
    onReassign(item.id, from, to.id);
    toast.show(`${to.name} gets "${item.text}"`);
    close();
  }

  function doApprove(item: PackItem, c: Claim) {
    onApprove?.(item.id, c.playerId);
    toast.show(`${nameOf(c.playerId)} gets "${item.text}"`);
    close();
  }

  const itemSheet = sheet.kind === 'item' ? sheet : null;
  const sheetClaims = itemSheet ? claimsOn(game, itemSheet.item.id) : [];
  const sheetRecent = itemSheet ? recentCall(game, itemSheet.item.id, now) : undefined;
  /** Who could still call the item from this phone: the host in a room, anyone without it on a shared phone. */
  const sheetCallers = itemSheet
    ? active.filter((p) => (you ? p.id === you : true) && !claimBy(game, itemSheet.item.id, p.id))
    : [];
  const sheetTargets = itemSheet?.reassigning
    ? active.filter((p) => p.id !== itemSheet.reassigning && !claimBy(game, itemSheet.item.id, p.id))
    : [];

  return (
    <Page
      title="Called It"
      bleed
      actions={
        onEnd ? (
          <button className="btn btn-ghost btn-auto" onClick={() => setSheet({ kind: 'end' })}>
            End
          </button>
        ) : (
          headerAction
        )
      }
    >
      {headerExtra}
      <Scoreboard standings={standings} />
      <p className="muted small center board-note">
        {!playing ? 'Game over' : self ? `${remainingFor(game, self)} left for you · tap what you see` : 'Tap what you see'}
      </p>
      <div className="chip-grid">
        {game.items.map((item) => {
          const claims = claimsOn(game, item.id);
          const mine = you ? claimBy(game, item.id, you) : undefined;
          const recent = recentCall(game, item.id, now);
          const blocked = !!recent && recent.playerId !== you;
          // On a shared phone an item is done once everyone still playing has it.
          const done = you ? mine?.status === 'claimed' : claims.length > 0 && active.every((p) => claimBy(game, item.id, p.id)?.status === 'claimed');
          const pending = mine?.status === 'pending';
          const names = claims.map((c) => `${nameOf(c.playerId)}${c.status === 'pending' ? ' · waiting' : ''}`);
          const cls = ['chip', done ? 'chip-claimed' : pending ? 'chip-pending' : blocked ? 'chip-window' : '']
            .filter(Boolean)
            .join(' ');
          const callers = blocked ? `${nameOf(recent.playerId)} just called it` : names.join(', ');
          const label = pending
            ? `${item.text}, called by you, waiting for the host`
            : mine
              ? `${item.text}, you have it, called by ${names.join(', ')}`
              : callers
                ? `${item.text}, ${blocked ? callers : `called by ${callers}`}`
                : item.text;
          return (
            <button key={item.id} className={cls} onClick={() => onChipTap(item)} aria-label={label}>
              <span>{item.text}</span>
              {callers && <span className="chip-claimer">{callers}</span>}
            </button>
          );
        })}
      </div>

      <Sheet
        open={!!itemSheet}
        title={
          itemSheet
            ? itemSheet.reassigning
              ? `Who really called "${itemSheet.item.text}"?`
              : sheetClaims.length === 0
                ? `Who called "${itemSheet.item.text}"?`
                : itemSheet.item.text
            : undefined
        }
        onClose={close}
      >
        {itemSheet && itemSheet.reassigning && (
          <>
            {sheetTargets.map((p) => (
              <button key={p.id} className="btn btn-primary" onClick={() => doReassign(itemSheet.item, itemSheet.reassigning!, p)}>
                {p.name}
              </button>
            ))}
            <button className="btn btn-ghost" onClick={() => setSheet({ ...itemSheet, reassigning: null })}>
              Back
            </button>
          </>
        )}
        {itemSheet && !itemSheet.reassigning && (
          <>
            {playing && sheetCallers.length > 0 && sheetRecent && (
              <p className="muted center">{nameOf(sheetRecent.playerId)} just called it. The next one is up for grabs in a moment.</p>
            )}
            {playing &&
              sheetCallers.map((p) => (
                <button
                  key={p.id}
                  className="btn btn-primary btn-big"
                  disabled={!!sheetRecent}
                  onClick={() => doClaim(itemSheet.item, p.id)}
                >
                  {you ? 'I called it too' : p.name}
                </button>
              ))}
            {sheetClaims.length > 0 && <div className="field-label">Called by</div>}
            {sheetClaims.map((c) => {
              const waiting = c.status === 'pending';
              const canGive = active.some((p) => p.id !== c.playerId && !claimBy(game, itemSheet.item.id, p.id));
              return (
                <div className="claim-row" key={c.playerId}>
                  <span className="grow">
                    {nameOf(c.playerId)}
                    {waiting && <span className="muted"> · waiting for your OK</span>}
                  </span>
                  {playing && waiting && (
                    <button className="btn btn-win btn-auto" onClick={() => doApprove(itemSheet.item, c)}>
                      OK
                    </button>
                  )}
                  {playing && (
                    <button className="btn btn-danger btn-auto" onClick={() => doUndo(itemSheet.item, c)}>
                      {waiting ? 'No' : 'Undo'}
                    </button>
                  )}
                  {playing && canGive && (
                    <button className="btn btn-auto" onClick={() => setSheet({ ...itemSheet, reassigning: c.playerId })}>
                      Give
                    </button>
                  )}
                </div>
              );
            })}
            <button className="btn btn-ghost" onClick={close}>
              {sheetCallers.length > 0 && playing ? 'Cancel' : 'Close'}
            </button>
          </>
        )}
      </Sheet>

      <Sheet open={sheet.kind === 'end'} title="End the game?" onClose={close}>
        <p className="muted center">
          Scores stay as they are. {uncalled === 0 ? 'Every item was called at least once.' : `${uncalled} items were never called.`}
        </p>
        <button
          className="btn btn-danger"
          onClick={() => {
            close();
            onEnd?.();
          }}
        >
          End game
        </button>
        <button className="btn btn-ghost" onClick={close}>
          Keep playing
        </button>
      </Sheet>
    </Page>
  );
}
