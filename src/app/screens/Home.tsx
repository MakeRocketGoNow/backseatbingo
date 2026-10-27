import { Link, useNavigate } from '@tanstack/react-router';
import { MODE_LABELS } from '@shared/types';
import { useGame } from '@app/store/game';
import { useSettings } from '@app/store/settings';

export function Home() {
  const { game, clear } = useGame();
  const [settings, setSettings] = useSettings();
  const navigate = useNavigate();
  const inProgress = game && game.status === 'playing';

  return (
    <div className="page">
      <main className="page-body">
        <div className="hero">
          <h1 className="hero-title">Backseat Bingo</h1>
          <p className="hero-sub">Spot it out the window. Call it first.</p>
        </div>

        <div className="btn-stack">
          {inProgress && (
            <button
              className="btn btn-win btn-big"
              onClick={() => void navigate({ to: game.mode === 'spotit' ? '/play/called-it' : '/play/bingo' })}
            >
              Resume {MODE_LABELS[game.mode]}
            </button>
          )}
          <Link to="/host" className="btn btn-primary btn-big">
            Start a trip
            <span className="btn-sub">Everyone plays on their own phone</span>
          </Link>
          <Link to="/join" className="btn btn-big">
            Join a trip
            <span className="btn-sub">Got a code or a link?</span>
          </Link>
          <Link to="/setup" className="btn btn-big" onClick={() => inProgress && clear()}>
            Play on this phone
            <span className="btn-sub">No signal needed, pass it around</span>
          </Link>
          <Link to="/lists" className="btn btn-outline">
            Custom lists
          </Link>
        </div>

        <label className="switch">
          <span>Sound</span>
          <input type="checkbox" checked={settings.sound} onChange={(e) => setSettings({ ...settings, sound: e.target.checked })} />
        </label>
      </main>
    </div>
  );
}
