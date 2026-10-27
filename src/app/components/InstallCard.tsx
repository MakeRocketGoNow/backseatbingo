import { useInstallOffer } from '@app/store/install';

/** Offered to the host on the winner screen: a trip went well, keep the app. */
export function InstallCard() {
  const { offer, dismiss } = useInstallOffer();
  if (!offer) return null;

  return (
    <div className="install-card">
      <p className="install-title">Keep Backseat Bingo on your phone</p>
      {offer.kind === 'prompt' ? (
        <>
          <p className="small muted">Opens from your home screen, with or without a signal.</p>
          <div className="btn-row">
            <button className="btn btn-primary btn-auto" onClick={() => void offer.install()}>
              Add to home screen
            </button>
            <button className="btn btn-ghost btn-auto" onClick={dismiss}>
              Not now
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="small muted">In Safari, tap Share, then "Add to Home Screen".</p>
          <div className="btn-row">
            <button className="btn btn-ghost btn-auto" onClick={dismiss}>
              Got it
            </button>
          </div>
        </>
      )}
    </div>
  );
}
