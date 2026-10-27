import type { ConnectionStatus } from '@app/store/room';

const LABEL: Record<ConnectionStatus, string> = {
  connecting: 'Connecting…',
  open: 'Connected',
  reconnecting: 'Reconnecting… taps will send when you are back',
  closed: 'Disconnected',
};

/** Small always-visible indicator. Cell signal on a road trip is unreliable and people should know when they are stale. */
export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  return (
    <div className={`conn conn-${status}`} role="status" aria-live="polite">
      <span className="conn-dot" aria-hidden="true" />
      <span>{LABEL[status]}</span>
    </div>
  );
}
