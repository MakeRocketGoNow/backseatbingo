import { useEffect } from 'react';
import { registerServiceWorker } from '@app/pwa';
import { useToast } from './Toast';

/** Registers the service worker and offers a reload when a new build is waiting. */
export function PwaUpdates() {
  const { show } = useToast();
  useEffect(() => {
    registerServiceWorker((apply) => show('A new version is ready.', { action: { label: 'Reload', onClick: apply } }));
  }, [show]);
  return null;
}
