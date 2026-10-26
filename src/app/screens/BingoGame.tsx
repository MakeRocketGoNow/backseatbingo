import { useEffect } from 'react';
import { Navigate, useNavigate } from '@tanstack/react-router';
import { BingoBoard } from '@app/components/BingoBoard';
import { useGame } from '@app/store/game';

/** Local pass-and-play Bingo, one card per named player. */
export function BingoGame() {
  const { game, toggleMark, callBingo, end } = useGame();
  const navigate = useNavigate();

  const ended = game?.mode === 'bingo' && game.status === 'ended';
  useEffect(() => {
    if (ended) void navigate({ to: '/winner', replace: true });
  }, [ended, navigate]);

  if (!game || game.mode !== 'bingo') return <Navigate to="/setup" replace />;

  return (
    <BingoBoard
      game={game}
      you={null}
      onToggle={(playerId, cell) => void toggleMark(playerId, cell)}
      onBingo={(playerId) => void callBingo(playerId)}
      onEnd={end}
    />
  );
}
