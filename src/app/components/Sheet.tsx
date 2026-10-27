import { useEffect, useRef, type ReactNode } from 'react';

interface SheetProps {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet with big stacked actions. Backdrop tap or Escape closes it.
 * While open it holds keyboard focus, and it hands focus back on close.
 */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  // Callers pass inline handlers; reading through a ref keeps the effect from re-running each render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => [...(sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    // Focus the dialog, not its first button: in a confirmation that is the destructive one.
    sheetRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const inside = sheetRef.current?.contains(document.activeElement);
      const atStart = document.activeElement === first || document.activeElement === sheetRef.current;
      if (e.shiftKey && (atStart || !inside)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {title && <h2 className="sheet-title">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
