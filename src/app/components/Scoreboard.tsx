import type { Standing } from '@shared/types';

interface ScoreboardProps {
  standings: Standing[];
  /** Label shown instead of the score, keyed by player id (e.g. "Bingo!"). */
  badges?: Record<string, string>;
}

/** Sticky strip of name + score, sorted descending. Always visible in-game. */
export function Scoreboard({ standings, badges }: ScoreboardProps) {
  return (
    <div className="scoreboard" aria-label="Scoreboard">
      {standings.map((s) => (
        <div className={`score ${s.rank === 1 && s.score > 0 ? 'score-leader' : ''}`} key={s.player.id}>
          <span className="score-name">{s.player.name}</span>
          <span className="score-value">{badges?.[s.player.id] ?? s.score}</span>
        </div>
      ))}
    </div>
  );
}
