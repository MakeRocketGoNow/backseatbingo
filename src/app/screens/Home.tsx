import { Link, useNavigate } from '@tanstack/react-router';
import { MODE_LABELS } from '@shared/types';
import { OFFLINE_MESSAGE } from '@app/api';
import { useGame } from '@app/store/game';
import { useOnline } from '@app/store/online';
import { useSettings } from '@app/store/settings';
import { Logo } from '@app/components/Logo';

export function Home() {
  const { game, clear } = useGame();
  const [settings, setSettings] = useSettings();
  const navigate = useNavigate();
  const online = useOnline();
  const inProgress = game && game.status === 'playing';

  return (
    <div className="page">
      <main className="page-body">
        <div className="hero">
          <Logo />
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
          {/* Trips need the network; local play never does. Keep the buttons
              visible so the layout holds, but make the reason plain before
              anyone taps. */}
          {!online && (
            <div className="notice center" role="status">
              {OFFLINE_MESSAGE}
            </div>
          )}
          <Link to="/host" className="btn btn-primary btn-big" disabled={!online}>
            Start a trip
            <span className="btn-sub">{online ? 'Everyone plays on their own phone' : 'Needs a signal'}</span>
          </Link>
          <Link to="/join" className="btn btn-big" disabled={!online}>
            Join a trip
            <span className="btn-sub">{online ? 'Got a code or a link?' : 'Needs a signal'}</span>
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
