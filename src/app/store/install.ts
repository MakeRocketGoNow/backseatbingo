import { useSyncExternalStore } from 'react';
import { createLocalStore, isRecord } from './localStore';

/** Chrome's deferred install prompt. Not in lib.dom, so typed here. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// Captured at module load: the event fires once, soon after the page loads,
// and only if it is not already installed.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

interface InstallPrefs {
  dismissed: boolean;
}

const prefs = createLocalStore<InstallPrefs>(
  'bb:install',
  { dismissed: false },
  (v): v is InstallPrefs => isRecord(v) && typeof v['dismissed'] === 'boolean',
);

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iOS has no install event; Safari users get told where the menu item is instead. */
export function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return ios && safari;
}

export type InstallOffer = { kind: 'prompt'; install: () => Promise<void> } | { kind: 'ios-hint' } | null;

/**
 * What to offer the host once a trip has gone well: Chrome's own prompt
 * where it exists, a hint on iOS Safari, nothing once installed or declined.
 */
export function useInstallOffer(): { offer: InstallOffer; dismiss: () => void } {
  const event = useSyncExternalStore(subscribe, () => deferred, () => null);
  const [{ dismissed }, setPrefs] = prefs.use();
  const dismiss = () => setPrefs({ dismissed: true });

  if (dismissed || isStandalone()) return { offer: null, dismiss };
  if (event) {
    return {
      offer: {
        kind: 'prompt',
        install: async () => {
          await event.prompt();
          const { outcome } = await event.userChoice;
          deferred = null;
          notify();
          if (outcome === 'dismissed') dismiss();
        },
      },
      dismiss,
    };
  }
  if (isIosSafari()) return { offer: { kind: 'ios-hint' }, dismiss };
  return { offer: null, dismiss };
}
