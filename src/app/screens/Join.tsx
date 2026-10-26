import { Link } from '@tanstack/react-router';
import { Page } from '@app/components/Page';

/**
 * Reserved route for Phase 2 join links (/j/<CODE>).
 * Keeping the route from day one means the URL shape never changes.
 */
export function Join({ code }: { code: string }) {
  return (
    <Page title="Join a trip" back="/">
      <div className="notice">
        Trips with friends on their own phones are coming in the next release. Code: <strong>{code.toUpperCase()}</strong>
      </div>
      <Link to="/setup" className="btn btn-primary">
        Play on this phone instead
      </Link>
    </Page>
  );
}
