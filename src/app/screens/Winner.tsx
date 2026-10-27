import { Link, Navigate, useNavigate } from '@tanstack/react-router';
import { WinnerView } from '@app/components/WinnerView';
import { useGame } from '@app/store/game';
import { useLastSetup } from '@app/store/lastSetup';

export function Winner() {
  const { game, clear } = useGame();
  const navigate = useNavigate();
  const [, setLast] = useLastSetup();

  if (!game) return <Navigate to="/" replace />;

  function playAgain() {
    // Called It is the default on "play again". The finished game stays in
    // the store until Setup starts a new one; clearing it here would
    // re-render this screen with no game and bounce to Home.
    setLast((prev) => ({ ...prev, mode: 'spotit' }));
    void navigate({ to: '/setup', replace: true });
  }

  return (
    <WinnerView game={game}>
      <button className="btn btn-primary btn-big" onClick={playAgain}>
        Play again
      </button>
      <Link to="/" className="btn" onClick={() => clear()}>
        Home
      </Link>
    </WinnerView>
  );
}
