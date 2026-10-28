import type { ReactNode } from 'react';
import type { GameState } from '@shared/types';
import { BINGO_PATTERN_LABELS, MODE_LABELS } from '@shared/types';
import { bingoStandings, finisher, spotItStandings } from '@game/index';
import { Page } from './Page';
import { TipLine } from './TipLine';

interface WinnerViewProps {
  game: GameState;
  /** Action buttons under the standings. */
  children?: ReactNode;
  headerExtra?: ReactNode;
}

export function WinnerView({ game, children, headerExtra }: WinnerViewProps) {
  const standings = game.mode === 'spotit' ? spotItStandings(game) : bingoStandings(game);
  const top = standings[0];
  const isBingo = game.mode === 'bingo';
  const bingoWinner = isBingo && game.winners.length > 0;
  const noWinner = (isBingo && !bingoWinner) || (!isBingo && (top?.score ?? 0) === 0);
  const tiedTop = standings.filter((s) => s.rank === 1);
  const finished = isBingo ? undefined : finisher(game);

  let headline: string;
  if (noWinner) headline = isBingo ? 'No one got Bingo' : 'No one called anything';
  else if (isBingo) headline = `${top?.player.name} got Bingo!`;
  else if (finished) headline = `${finished.name} got the whole list!`;
  else if (tiedTop.length > 1) headline = `It's a tie!`;
  else headline = `${top?.player.name} wins!`;

  return (
    <Page title={`${MODE_LABELS[game.mode]} over`}>
      {headerExtra}
      <div className="hero">
        <h2 className="hero-title">{headline}</h2>
        {isBingo && <p className="hero-sub">Pattern: {BINGO_PATTERN_LABELS[game.pattern]}</p>}
      </div>

      <ol className="standings" aria-label="Final standings">
        {standings.map((s) => {
          const bingoed = isBingo && game.winners.some((w) => w.playerId === s.player.id);
          const first = s.rank === 1 && !noWinner;
          return (
            <li className={`standing ${first ? 'standing-first' : ''}`} key={s.player.id}>
              <span className="standing-rank">{first ? '🏆' : s.rank}</span>
              <span>
                {s.player.name}
                {s.player.left && ' (left)'}
              </span>
              <span className="standing-score">{isBingo ? (bingoed ? 'Bingo!' : `${s.score} marked`) : s.score}</span>
            </li>
          );
        })}
      </ol>

      <div className="btn-stack">{children}</div>
      <TipLine />
    </Page>
  );
}
