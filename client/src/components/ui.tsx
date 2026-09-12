import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`card ${className ?? ""}`}>
      {title && <h3 className="card-title">{title}</h3>}
      {subtitle && <div className="card-sub">{subtitle}</div>}
      {children}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="center-state">
      <div>
        <div className="spinner" />
        <div className="muted">{label ?? "Loading live data…"}</div>
      </div>
    </div>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <div className="empty-hint">{children}</div>;
}

export function ErrorState({ error }: { error: Error & { hint?: string } }) {
  return (
    <div className="center-state">
      <div className="error-box">
        <h2>Couldn’t load the sheet</h2>
        <div>{error.message}</div>
        {error.hint && <div className="error-hint">{error.hint}</div>}
      </div>
    </div>
  );
}
