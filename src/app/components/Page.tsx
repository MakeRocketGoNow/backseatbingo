import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';

interface PageProps {
  title: string;
  back?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** Full-bleed pages (the game screens) manage their own scrolling. */
  bleed?: boolean;
}

export function Page({ title, back, actions, children, bleed }: PageProps) {
  return (
    <div className={`page ${bleed ? 'page-bleed' : ''}`}>
      <header className="page-header">
        {back ? (
          <Link to={back} className="btn btn-ghost btn-icon" aria-label="Back">
            ‹
          </Link>
        ) : (
          <span className="btn-icon" />
        )}
        <h1 className="page-title">{title}</h1>
        <div className="page-actions">{actions ?? <span className="btn-icon" />}</div>
      </header>
      <main className="page-body">{children}</main>
    </div>
  );
}
