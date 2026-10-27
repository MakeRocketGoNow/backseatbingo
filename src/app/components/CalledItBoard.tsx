import { useMemo, useState, type ReactNode } from 'react';
import type { PackItem, Player, SpotItState } from '@shared/types';
import { spotItStandings } from '@game/index';
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
  onUnclaim: (itemId: string) => void;
  onReassign: (itemId: string, playerId: string) => void;
  onApprove?: (itemId: string) => void;
  /** When present, the header shows an End button that confirms before calling it. */
  onEnd?: () => void;
  /** Rendered under the header, above the scoreboard (connection badge in rooms). */
  headerExtra?: ReactNode;
  /** Rendered in the header's action slot when there is no End button (guest controls). */
  headerAction?: ReactNode;
}

type SheetState =
  | { kind: 'none' }
  | { kind: 'who'; item: PackItem }
  | { kind: 'claimed'; item: PackItem; reassigning: boolean }
  | { kind: 'end' };

export function CalledItBoard(props: CalledItBoardProps) {
  const { game, you, isHost, onClaim, onUnclaim, onReassign, onApprove, onEnd, headerExtra, headerAction } = props;
  const toast = useToast();
  const [sheet, setSheet] = useState<SheetState>({ kind: 'none' });
  const standings = useMemo(() => spotItStandings(game), [game]);
  const playing = game.status === 'playing';

  const playerById = (id: string): Player | undefined => game.players.find((p) => p.id === id);
  const nameOf = (id: string): string => playerById(id)?.name ?? 'Someone';
  // People who left the trip keep their score but cannot be handed a call.
  const active = game.players.filter((p) => !p.left);
  const remaining = game.items.filter((i) => game.claims[i.id]?.status !== 'claimed').length;

  function close() {
    setSheet({ kind: 'none' });
  }

  function doClaim(item: PackItem, playerId: string) {
    claimFeedback();
    onClaim(item.id, playerId);
    close();
  }

  function onChipTap(item: PackItem) {
    const existing = game.claims[item.id];
    if (existing) {
      if (isHost) {
        setSheet({ kind: 'claimed', item, reassigning: false });
      } else if (existing.status === 'pending' && existing.playerId === you) {
        toast.show('Waiting for the host to OK it');
      } else {
        toast.show(`${nameOf(existing.playerId)} got it`);
      }
      return;
    }
    if (!playing) return;
    if (you) return doClaim(item, you);
    const only = active.length === 1 ? active[0] : undefined;
    if (only) return doClaim(item, only.id);
    setSheet({ kind: 'who', item });
  }

  function doUndo(item: PackItem) {
    onUnclaim(item.id);
    toast.show(`"${item.text}" is back up for grabs`);
    close();
  }

  function doReassign(item: PackItem, player: Player) {
    onReassign(item.id, player.id);
    toast.show(`${player.name} gets "${item.text}"`);
    close();
  }

  function doApprove(item: PackItem, claimer: string) {
    onApprove?.(item.id);
    toast.show(`${claimer} gets "${item.text}"`);
    close();
  }

  const claimedSheet = sheet.kind === 'claimed' ? game.claims[sheet.item.id] : undefined;
  const claimedName = claimedSheet ? nameOf(claimedSheet.playerId) : 'Someone';
  const claimedPending = claimedSheet?.status === 'pending';

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
        {playing ? `${remaining} left · tap what you see` : 'Game over'}
      </p>
      <div className="chip-grid">
        {game.items.map((item) => {
          const c = game.claims[item.id];
          const claimer = c ? nameOf(c.playerId) : undefined;
          const pending = c?.status === 'pending';
          const cls = ['chip', c ? (pending ? 'chip-pending' : 'chip-claimed') : ''].filter(Boolean).join(' ');
          const label = c
            ? `${item.text}, ${pending ? 'called by' : 'claimed by'} ${claimer}${pending ? ', waiting for the host' : ''}`
            : item.text;
          return (
            <button key={item.id} className={cls} onClick={() => onChipTap(item)} aria-label={label}>
              <span>{item.text}</span>
              {claimer && (
                <span className="chip-claimer">
                  {claimer}
                  {pending ? ' · waiting' : ''}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Sheet open={sheet.kind === 'who'} title={sheet.kind === 'who' ? `Who called "${sheet.item.text}"?` : undefined} onClose={close}>
        {sheet.kind === 'who' &&
          active.map((p) => (
            <button key={p.id} className="btn btn-primary btn-big" onClick={() => doClaim(sheet.item, p.id)}>
              {p.name}
            </button>
          ))}
        <button className="btn btn-ghost" onClick={close}>
          Cancel
        </button>
      </Sheet>

      <Sheet
        open={sheet.kind === 'claimed'}
        title={
          sheet.kind === 'claimed'
            ? sheet.reassigning
              ? `Who really called "${sheet.item.text}"?`
              : `${claimedName} called "${sheet.item.text}"`
            : undefined
        }
        onClose={close}
      >
        {sheet.kind === 'claimed' && !sheet.reassigning && (
          <>
            {claimedPending && <p className="muted center">Waiting for your OK.</p>}
            {claimedPending && claimedSheet && (
              <button className="btn btn-win" onClick={() => doApprove(sheet.item, claimedName)}>
                OK, {claimedName} got it
              </button>
            )}
            <button className="btn btn-danger" onClick={() => doUndo(sheet.item)}>
              {claimedPending ? 'No, they didn’t' : 'Undo'}
            </button>
            {active.some((p) => p.id !== claimedSheet?.playerId) && (
              <button className="btn" onClick={() => setSheet({ ...sheet, reassigning: true })}>
                Give it to someone else
              </button>
            )}
          </>
        )}
        {sheet.kind === 'claimed' &&
          sheet.reassigning &&
          active
            .filter((p) => p.id !== claimedSheet?.playerId)
            .map((p) => (
              <button key={p.id} className="btn btn-primary" onClick={() => doReassign(sheet.item, p)}>
                {p.name}
              </button>
            ))}
        <button className="btn btn-ghost" onClick={close}>
          Cancel
        </button>
      </Sheet>

      <Sheet open={sheet.kind === 'end'} title="End the game?" onClose={close}>
        <p className="muted center">Scores stay as they are. {remaining} items were never called.</p>
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
