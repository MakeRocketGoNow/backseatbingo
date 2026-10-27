import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  /** A button on the toast. Toasts with an action stay until it is tapped or dismissed. */
  action?: ToastAction;
}

interface ToastApi {
  show: (message: string, options?: ToastOptions) => void;
}

interface ToastState {
  message: string;
  action?: ToastAction;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);
  // The toast with an action, kept apart so a passing toast cannot wipe it:
  // it comes back once the passing one times out.
  const pinned = useRef<ToastState | null>(null);

  const show = useCallback((message: string, options?: ToastOptions) => {
    window.clearTimeout(timer.current);
    if (options?.action) {
      pinned.current = { message, action: options.action };
      setToast(pinned.current);
      return;
    }
    setToast({ message });
    timer.current = window.setTimeout(() => setToast(pinned.current), 2500);
  }, []);

  const close = () => {
    pinned.current = null;
    setToast(null);
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div className={`toast ${toast.action ? 'toast-action' : ''}`} role="status" aria-live="polite">
          <span className="grow">{toast.message}</span>
          {toast.action && (
            <>
              <button
                className="btn btn-primary btn-auto"
                onClick={() => {
                  close();
                  toast.action?.onClick();
                }}
              >
                {toast.action.label}
              </button>
              <button className="btn btn-ghost btn-icon" aria-label="Dismiss" onClick={close}>
                ×
              </button>
            </>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
