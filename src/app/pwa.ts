/**
 * Service worker registration. Production builds only: the Vite dev server
 * has no `sw.js`, and a worker there would cache stale modules.
 *
 * A new deploy installs in the background and waits. We never force it in,
 * because a page mid-game must keep the assets it was built with; `onUpdate`
 * lets the app offer a reload, and `apply` sends the waiting worker
 * `skip-waiting`, after which the controller change reloads the page.
 */
let registered = false;

export function registerServiceWorker(onUpdate: (apply: () => void) => void): void {
  if (registered || !import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  registered = true;

  const offer = (worker: ServiceWorker) => {
    // No controller means a first install, which needs no reload.
    if (!navigator.serviceWorker.controller) return;
    onUpdate(() => worker.postMessage({ type: 'skip-waiting' }));
  };

  const start = () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        const watch = (worker: ServiceWorker | null) => {
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed') offer(worker);
          });
        };
        if (reg.waiting) offer(reg.waiting);
        // The browser's own update check on navigation may already be under
        // way, with `updatefound` fired before we could listen.
        watch(reg.installing);
        reg.addEventListener('updatefound', () => watch(reg.installing));
      })
      .catch(() => {
        // Registration failing only means no offline shell; the app still runs.
      });

    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    });
  };

  // Registering after load keeps the worker off the first paint's critical
  // path; by the time React mounts, load has often already fired.
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
