import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from '@tanstack/react-router';
import type { PackItem, Player, SpotItState } from '@shared/types';
import { spotItStandings } from '@game/index';
import { Page } from '@app/components/Page';
import { Scoreboard } from '@app/components/Scoreboard';
import { Sheet } from '@app/components/Sheet';
import { useToast } from '@app/components/Toast';
import { claimFeedback } from '@app/feedback';
import { useGame } from '@app/store/game';

type SheetState =
  | { kind: 'none' }
  | { kind: 'who'; item: PackItem }
  | { kind: 'claimed'; item: PackItem; reassigning: boolean }
  | { kind: 'end' };

export function CalledItGame() {
  const { game, claim, unclaim, reassign, end } = useGame();
  const navigate = useNavigate();
  const toast = useToast();
  const [sheet, setSheet] = useState<SheetState>({ kind: 'none' });

  const ended = game?.mode === 'spotit' && game.status === 'ended';
  useEffect(() => {
    if (ended) void navigate({ to: '/winner', replace: true });
  }, [ended, navigate]);

  const standings = useMemo(() => (game?.mode === 'spotit' ? spotItStandings(game) : []), [game]);

  if (!game || game.mode !== 'spotit') return <Navigate to="/setup" replace />;
  const spot: SpotItState = game;

  const playerById = (id: string): Player | undefined => spot.players.find((p) => p.id === id);
  const remaining = game.items.length - Object.keys(game.claims).length;

  function doClaim(item: PackItem, player: Player) {
    const r = claim(item.id, player.id);
    if (r.ok) claimFeedback();
    else if (r.error === 'already-claimed') toast.show(`${playerById(spot.claims[item.id]?.playerId ?? '')?.name ?? 'Someone'} already got it`);
    setSheet({ kind: 'none' });
  }

  function onChipTap(item: PackItem) {
    const existing = spot.claims[item.id];
    if (existing) {
      setSheet({ kind: 'claimed', item, reassigning: false });
      return;
    }
    const only = spot.players.length === 1 ? spot.players[0] : undefined;
    if (only) doClaim(item, only);
    else setSheet({ kind: 'who', item });
  }

  function doUndo(item: PackItem) {
    const r = unclaim(item.id);
    if (r.ok) toast.show(`"${item.text}" is back up for grabs`);
    setSheet({ kind: 'none' });
  }

  function doReassign(item: PackItem, player: Player) {
    const r = reassign(item.id, player.id);
    if (r.ok) toast.show(`${player.name} gets "${item.text}"`);
    setSheet({ kind: 'none' });
  }

  return (
    <Page
      title="Called It"
      bleed
      actions={
        <button className="btn btn-ghost btn-auto" onClick={() => setSheet({ kind: 'end' })}>
          End
        </button>
      }
    >
      <Scoreboard standings={standings} />
      <p className="muted small center" style={{ margin: '8px 16px 0' }}>
        {remaining} left · tap what you see
      </p>
      <div className="chip-grid">
        {game.items.map((item) => {
          const c = game.claims[item.id];
          const claimer = c ? playerById(c.playerId) : undefined;
          return (
            <button
              key={item.id}
              className={`chip ${c ? 'chip-claimed' : ''}`}
              onClick={() => onChipTap(item)}
              aria-label={c ? `${item.text}, called by ${claimer?.name ?? 'someone'}` : item.text}
            >
              <span>{item.text}</span>
              {claimer && <span className="chip-claimer">{claimer.name}</span>}
            </button>
          );
        })}
      </div>

      <Sheet
        open={sheet.kind === 'who'}
        title={sheet.kind === 'who' ? `Who called "${sheet.item.text}"?` : undefined}
        onClose={() => setSheet({ kind: 'none' })}
      >
        {sheet.kind === 'who' &&
          game.players.map((p) => (
            <button key={p.id} className="btn btn-primary btn-big" onClick={() => doClaim(sheet.item, p)}>
              {p.name}
            </button>
          ))}
        <button className="btn btn-ghost" onClick={() => setSheet({ kind: 'none' })}>
          Cancel
        </button>
      </Sheet>

      <Sheet
        open={sheet.kind === 'claimed'}
        title={
          sheet.kind === 'claimed'
            ? sheet.reassigning
              ? `Who really called "${sheet.item.text}"?`
              : `${playerById(game.claims[sheet.item.id]?.playerId ?? '')?.name ?? 'Someone'} called "${sheet.item.text}"`
            : undefined
        }
        onClose={() => setSheet({ kind: 'none' })}
      >
        {sheet.kind === 'claimed' && !sheet.reassigning && (
          <>
            <button className="btn btn-danger" onClick={() => doUndo(sheet.item)}>
              Undo
            </button>
            {game.players.length > 1 && (
              <button className="btn" onClick={() => setSheet({ ...sheet, reassigning: true })}>
                Give it to someone else
              </button>
            )}
          </>
        )}
        {sheet.kind === 'claimed' &&
          sheet.reassigning &&
          game.players
            .filter((p) => p.id !== game.claims[sheet.item.id]?.playerId)
            .map((p) => (
              <button key={p.id} className="btn btn-primary" onClick={() => doReassign(sheet.item, p)}>
                {p.name}
              </button>
            ))}
        <button className="btn btn-ghost" onClick={() => setSheet({ kind: 'none' })}>
          Cancel
        </button>
      </Sheet>

      <Sheet open={sheet.kind === 'end'} title="End the game?" onClose={() => setSheet({ kind: 'none' })}>
        <p className="muted center">Scores stay as they are. {remaining} items were never called.</p>
        <button className="btn btn-danger" onClick={() => end()}>
          End game
        </button>
        <button className="btn btn-ghost" onClick={() => setSheet({ kind: 'none' })}>
          Keep playing
        </button>
      </Sheet>
    </Page>
  );
}
