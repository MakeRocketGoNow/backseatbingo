import { useEffect } from 'react';
import { Navigate, useNavigate } from '@tanstack/react-router';
import { CalledItBoard } from '@app/components/CalledItBoard';
import { useGame } from '@app/store/game';

/** Local pass-the-phone Called It. The phone holder is the host. */
export function CalledItGame() {
  const { game, claim, unclaim, reassign, end } = useGame();
  const navigate = useNavigate();

  const ended = game?.mode === 'spotit' && game.status === 'ended';
  useEffect(() => {
    if (ended) void navigate({ to: '/winner', replace: true });
  }, [ended, navigate]);

  if (!game || game.mode !== 'spotit') return <Navigate to="/setup" replace />;

  return (
    <CalledItBoard
      game={game}
      you={null}
      isHost
      onClaim={(itemId, playerId) => void claim(itemId, playerId)}
      onUnclaim={(itemId, playerId) => void unclaim(itemId, playerId)}
      onReassign={(itemId, from, to) => void reassign(itemId, from, to)}
      onEnd={end}
    />
  );
}
