import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { BingoCard, BingoState, Player } from '@shared/types';
import { BINGO_FREE_INDEX, BINGO_PATTERN_LABELS } from '@shared/types';
import { bingoStandings, hasPattern, winningCells } from '@game/index';
import { claimFeedback, winFeedback } from '@app/feedback';
import { Page } from './Page';
import { Scoreboard } from './Scoreboard';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

export interface BingoBoardProps {
  game: BingoState;
  /** The viewer's player id in a room (only their card shows), or null for pass-and-play with every card. */
  you: string | null;
  onToggle: (playerId: string, cell: number, marked: boolean) => void;
  onBingo: (playerId: string) => void;
  onEnd?: () => void;
  headerExtra?: ReactNode;
  headerAction?: ReactNode;
}

export function BingoBoard({ game, you, onToggle, onBingo, onEnd, headerExtra, headerAction }: BingoBoardProps) {
  const toast = useToast();
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [current, setCurrent] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const standings = useMemo(() => bingoStandings(game), [game]);

  const badges: Record<string, string> = {};
  game.winners.forEach((w, i) => {
    badges[w.playerId] = i === 0 ? 'Bingo!' : `Bingo #${i + 1}`;
  });

  const visible: Player[] = you ? game.players.filter((p) => p.id === you) : game.players;

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
    const card = game.cards[player.id];
    if (!card) return;
    const marked = !card.marks[cell];
    if (marked) claimFeedback();
    onToggle(player.id, cell, marked);
  }

  function callIt(player: Player) {
    winFeedback();
    toast.show(`${player.name} has Bingo!`);
    onBingo(player.id);
  }

  return (
    <Page
      title="Bingo"
      bleed
      actions={
        onEnd ? (
          <button className="btn btn-ghost btn-auto" onClick={() => setConfirmEnd(true)}>
            End
          </button>
        ) : (
          headerAction
        )
      }
    >
      {headerExtra}
      <Scoreboard standings={standings} badges={badges} />
      <p className="pattern-note" style={{ margin: '8px 16px 0' }}>
        Pattern: {BINGO_PATTERN_LABELS[game.pattern]}
      </p>
      {visible.length > 1 && (
        <div className="bingo-tabs" role="tablist" aria-label="Cards">
          {visible.map((p, i) => (
            <button key={p.id} role="tab" aria-selected={i === current} className="bingo-tab" onClick={() => goTo(i)}>
              {p.name}
            </button>
          ))}
        </div>
      )}
      {visible.length === 0 && <div className="notice center">You will get a card when the next round starts.</div>}
      <div className="bingo-strip" ref={strip} onScroll={onScroll}>
        {visible.map((player) => {
          const card = game.cards[player.id];
          if (!card) return null;
          return (
            <section className="bingo-slide" key={player.id} aria-label={`${player.name}'s card`}>
              <CardView
                card={card}
                game={game}
                player={player}
                showName={visible.length > 1}
                onCellTap={(cell) => onCellTap(player, cell)}
                onBingo={() => callIt(player)}
              />
            </section>
          );
        })}
      </div>

      <Sheet open={confirmEnd} title="End the game?" onClose={() => setConfirmEnd(false)}>
        <p className="muted center">
          {game.winners.length === 0 ? 'No one has bingo yet.' : 'Anyone without bingo stays where they are.'}
        </p>
        <button
          className="btn btn-danger"
          onClick={() => {
            setConfirmEnd(false);
            onEnd?.();
          }}
        >
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
  showName: boolean;
  onCellTap: (cell: number) => void;
  onBingo: () => void;
}

function CardView({ card, game, player, showName, onCellTap, onBingo }: CardViewProps) {
  const won = game.winners.some((w) => w.playerId === player.id);
  const met = hasPattern(card.marks, game.pattern);
  const winCells = won || met ? new Set(winningCells(card.marks, game.pattern) ?? []) : new Set<number>();

  return (
    <>
      {showName && <h2 className="center">{player.name}</h2>}
      {/* Plain toggle buttons in a group: a grid role would need rows and would hide aria-pressed. */}
      <div className="bingo-card" role="group" aria-label={`${player.name}'s bingo card`}>
        {card.cells.map((item, i) => {
          const free = i === BINGO_FREE_INDEX;
          const marked = card.marks[i] === true;
          const cls = ['cell', free ? 'cell-free' : '', marked && !free ? 'cell-marked' : '', winCells.has(i) ? 'cell-win' : '']
            .filter(Boolean)
            .join(' ');
          return (
            <button
              key={i}
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
      ) : met && game.status === 'playing' ? (
        <button className="btn btn-win" onClick={onBingo}>
          Bingo!
        </button>
      ) : (
        <p className="muted small center">Tap a square when you spot it.</p>
      )}
    </>
  );
}
