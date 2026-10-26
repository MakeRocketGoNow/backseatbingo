import { Link, Navigate, useNavigate } from '@tanstack/react-router';
import { BINGO_PATTERN_LABELS, MODE_LABELS } from '@shared/types';
import { bingoStandings, spotItStandings } from '@game/index';
import { Page } from '@app/components/Page';
import { useGame } from '@app/store/game';
import { useLastSetup } from '@app/store/lastSetup';

export function Winner() {
  const { game, clear } = useGame();
  const navigate = useNavigate();
  const [, setLast] = useLastSetup();

  if (!game) return <Navigate to="/" replace />;

  const standings = game.mode === 'spotit' ? spotItStandings(game) : bingoStandings(game);
  const top = standings[0];
  const isBingo = game.mode === 'bingo';
  const bingoWinner = isBingo && game.winners.length > 0;
  const noWinner = (isBingo && !bingoWinner) || (!isBingo && (top?.score ?? 0) === 0);
  const tiedTop = standings.filter((s) => s.rank === 1);

  let headline: string;
  if (noWinner) headline = isBingo ? 'No one got Bingo' : 'No one called anything';
  else if (isBingo) headline = `${top?.player.name} got Bingo!`;
  else if (tiedTop.length > 1) headline = `It's a tie!`;
  else headline = `${top?.player.name} wins!`;

  function playAgain() {
    // Called It is the default on "play again", per the plan. The finished
    // game stays in the store until Setup starts a new one; clearing it here
    // would re-render this screen with no game and bounce to Home.
    setLast((prev) => ({ ...prev, mode: 'spotit' }));
    void navigate({ to: '/setup', replace: true });
  }

  return (
    <Page title={`${MODE_LABELS[game.mode]} over`}>
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
              <span>{s.player.name}</span>
              <span className="standing-score">
                {isBingo ? (bingoed ? 'Bingo!' : `${s.score} marked`) : s.score}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="btn-stack">
        <button className="btn btn-primary btn-big" onClick={playAgain}>
          Play again
        </button>
        <Link to="/" className="btn" onClick={() => clear()}>
          Home
        </Link>
      </div>
    </Page>
  );
}
