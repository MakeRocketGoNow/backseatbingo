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
        if (reg.waiting) offer(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed') offer(worker);
          });
        });
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
