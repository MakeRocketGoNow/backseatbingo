import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from '@tanstack/react-router';
import type { BingoCard, BingoState, Player } from '@shared/types';
import { BINGO_FREE_INDEX, BINGO_PATTERN_LABELS } from '@shared/types';
import { bingoStandings, hasPattern, winningCells } from '@game/index';
import { Page } from '@app/components/Page';
import { Scoreboard } from '@app/components/Scoreboard';
import { Sheet } from '@app/components/Sheet';
import { useToast } from '@app/components/Toast';
import { claimFeedback, winFeedback } from '@app/feedback';
import { useGame } from '@app/store/game';

export function BingoGame() {
  const { game, toggleMark, callBingo, end } = useGame();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [current, setCurrent] = useState(0);
  const strip = useRef<HTMLDivElement>(null);

  const ended = game?.mode === 'bingo' && game.status === 'ended';
  useEffect(() => {
    if (ended) void navigate({ to: '/winner', replace: true });
  }, [ended, navigate]);

  const standings = useMemo(() => (game?.mode === 'bingo' ? bingoStandings(game) : []), [game]);

  if (!game || game.mode !== 'bingo') return <Navigate to="/setup" replace />;

  const badges: Record<string, string> = {};
  game.winners.forEach((w, i) => {
    badges[w.playerId] = i === 0 ? 'Bingo!' : `Bingo #${i + 1}`;
  });

  function goTo(i: number) {
    setCurrent(i);
    const el = strip.current?.children[i];
    if (el instanceof HTMLElement) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  function onScroll() {
    const el = strip.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== current) setCurrent(i);
  }

  function onCellTap(player: Player, cell: number) {
    const r = toggleMark(player.id, cell);
    if (r.ok && r.state.cards[player.id]?.marks[cell]) claimFeedback();
  }

  function onBingo(player: Player) {
    const r = callBingo(player.id);
    if (r.ok) {
      winFeedback();
      toast.show(`${player.name} has Bingo!`);
    } else if (r.error === 'pattern-not-met') {
      toast.show('Not quite yet');
    }
  }

  return (
    <Page
      title="Bingo"
      bleed
      actions={
        <button className="btn btn-ghost btn-auto" onClick={() => setConfirmEnd(true)}>
          End
        </button>
      }
    >
      <Scoreboard standings={standings} badges={badges} />
      <p className="pattern-note" style={{ margin: '8px 16px 0' }}>
        Pattern: {BINGO_PATTERN_LABELS[game.pattern]}
      </p>
      {game.players.length > 1 && (
        <div className="bingo-tabs" role="tablist" aria-label="Cards">
          {game.players.map((p, i) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={i === current}
              className="bingo-tab"
              onClick={() => goTo(i)}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
      <div className="bingo-strip" ref={strip} onScroll={onScroll}>
        {game.players.map((player) => {
          const card = game.cards[player.id];
          if (!card) return null;
          return (
            <section className="bingo-slide" key={player.id} aria-label={`${player.name}'s card`}>
              <CardView
                card={card}
                game={game}
                player={player}
                onCellTap={(cell) => onCellTap(player, cell)}
                onBingo={() => onBingo(player)}
              />
            </section>
          );
        })}
      </div>

      <Sheet open={confirmEnd} title="End the game?" onClose={() => setConfirmEnd(false)}>
        <p className="muted center">
          {game.winners.length === 0 ? 'No one has bingo yet.' : 'Anyone without bingo stays where they are.'}
        </p>
        <button className="btn btn-danger" onClick={() => end()}>
          End game
        </button>
        <button className="btn btn-ghost" onClick={() => setConfirmEnd(false)}>
          Keep playing
        </button>
      </Sheet>
    </Page>
  );
}

interface CardViewProps {
  card: BingoCard;
  game: BingoState;
  player: Player;
  onCellTap: (cell: number) => void;
  onBingo: () => void;
}

function CardView({ card, game, player, onCellTap, onBingo }: CardViewProps) {
  const won = game.winners.some((w) => w.playerId === player.id);
  const met = hasPattern(card.marks, game.pattern);
  const winCells = won || met ? new Set(winningCells(card.marks, game.pattern) ?? []) : new Set<number>();

  return (
    <>
      {game.players.length > 1 && <h2 className="center">{player.name}</h2>}
      <div className="bingo-card" role="grid" aria-label={`${player.name}'s bingo card`}>
        {card.cells.map((item, i) => {
          const free = i === BINGO_FREE_INDEX;
          const marked = card.marks[i] === true;
          const cls = ['cell', free ? 'cell-free' : '', marked && !free ? 'cell-marked' : '', winCells.has(i) ? 'cell-win' : '']
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={i}
              role="gridcell"
              className={cls}
              aria-pressed={marked}
              disabled={free || game.status !== 'playing'}
              onClick={() => onCellTap(i)}
            >
              {free ? 'FREE' : item?.text}
            </button>
          );
        })}
      </div>
      {won ? (
        <div className="notice center">{player.name} has Bingo!</div>
      ) : met ? (
        <button className="btn btn-win" onClick={onBingo}>
          Bingo!
        </button>
      ) : (
        <p className="muted small center">Tap a square when you spot it.</p>
      )}
    </>
  );
}
