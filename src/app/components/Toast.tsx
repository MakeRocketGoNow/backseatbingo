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

  const show = useCallback((message: string, options?: ToastOptions) => {
    setToast({ message, ...(options?.action ? { action: options.action } : {}) });
    window.clearTimeout(timer.current);
    if (!options?.action) timer.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && (
        <div className={`toast ${toast.action ? 'toast-action' : ''}`} role="status" aria-live="polite">
          <span>{toast.message}</span>
          {toast.action && (
            <>
              <button
                className="btn btn-primary btn-auto"
                onClick={() => {
                  setToast(null);
                  toast.action?.onClick();
                }}
              >
                {toast.action.label}
              </button>
              <button className="btn btn-ghost btn-icon" aria-label="Dismiss" onClick={() => setToast(null)}>
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
