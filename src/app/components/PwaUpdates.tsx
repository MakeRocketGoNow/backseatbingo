import { useEffect } from 'react';
import { registerServiceWorker } from '@app/pwa';
import { useToast } from './Toast';

/** Registers the service worker and offers a reload when a new build is waiting. */
export function PwaUpdates() {
  const toast = useToast();
  useEffect(() => {
    registerServiceWorker((apply) => toast.show('A new version is ready.', { action: { label: 'Reload', onClick: apply } }));
  }, [toast]);
  return null;
}
