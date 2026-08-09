'use client';

import { useEffect, useState } from 'react';

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function Card({ className, children, ...rest }) {
  return (
    <div className={cx('wf-card p-5', className)} {...rest}>
      {children}
    </div>
  );
}

export function Button({ variant = 'primary', className, as: As = 'button', ...rest }) {
  const styles = {
    primary: 'wf-btn-primary',
    secondary: 'wf-btn-secondary',
    danger: 'wf-btn-danger',
    ghost: 'wf-btn text-wiki-blue hover:bg-wiki-blue-light',
  };
  return <As className={cx(styles[variant] || styles.primary, className)} {...rest} />;
}

export function Field({ label, hint, error, children, required }) {
  return (
    <label className="block">
      <span className="wf-label">
        {label}
        {required ? <span className="ml-1 text-rose-600">*</span> : null}
      </span>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs font-medium text-rose-700">{error}</p>
      ) : hint ? (
        <p className="wf-hint">{hint}</p>
      ) : null}
    </label>
  );
}

/** CAP-3 asks for inline explainers next to fields whose purpose is not obvious. */
export function Explainer({ children }) {
  return (
    <p className="wf-note">
      <span aria-hidden="true" className="mr-1.5">
        💡
      </span>
      {children}
    </p>
  );
}

export function StatusBadge({ status }) {
  const styles = {
    draft: 'bg-slate-100 text-slate-700 ring-slate-300',
    active: 'bg-emerald-50 text-emerald-700 ring-emerald-300',
    scheduled: 'bg-sky-50 text-sky-700 ring-sky-300',
    inactive: 'bg-amber-50 text-amber-800 ring-amber-300',
    cancelled: 'bg-rose-50 text-rose-700 ring-rose-300',
    ended: 'bg-violet-50 text-violet-700 ring-violet-300',
  };
  return (
    <span className={cx('wf-chip text-xs uppercase tracking-wide', styles[status] || styles.draft)}>
      {status}
    </span>
  );
}

export function Stat({ label, value, sub }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-wiki-slate">{label}</span>
      <span className="text-3xl font-bold text-wiki-ink">{value}</span>
      {sub ? <span className="text-xs text-wiki-slate">{sub}</span> : null}
    </Card>
  );
}

export function Spinner({ label = 'Loading' }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-wiki-slate">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-wiki-line border-t-wiki-blue" />
      {label}
    </span>
  );
}

export function Empty({ title, body, action }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-14 text-center">
      <span aria-hidden="true" className="text-4xl">
        🖼️
      </span>
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="max-w-md text-sm text-wiki-slate">{body}</p>
      {action}
    </Card>
  );
}

export function Alert({ tone = 'error', children, onDismiss }) {
  if (!children) return null;
  const styles = {
    error: 'border-rose-300 bg-rose-50 text-rose-800',
    success: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    info: 'border-wiki-blue/30 bg-wiki-blue-light text-wiki-blue-dark',
  };
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('flex items-start gap-3 rounded-lg border px-4 py-3 text-sm', styles[tone])}
    >
      <span className="flex-1">{children}</span>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="font-bold" aria-label="Dismiss">
          ×
        </button>
      ) : null}
    </div>
  );
}

/** Small toast used for "copied" style confirmations. */
export function useToast() {
  const [message, setMessage] = useState(null);
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(null), 2600);
    return () => clearTimeout(timer);
  }, [message]);

  const node = message ? (
    <div
      role="status"
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-wiki-ink px-5 py-2.5
                 text-sm font-medium text-white shadow-lg"
    >
      {message}
    </div>
  ) : null;

  return [node, setMessage];
}

export { formatDate, formatDateRange, toDateTimeLocal, pluralize } from '@/lib/format';
