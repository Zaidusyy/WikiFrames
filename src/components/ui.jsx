'use client';

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import Icon from '@/components/Icon';

// The shared UI kit, modelled on Codex (the Wikimedia Design System) so every
// screen speaks the same visual language as the wikis themselves.

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

const BUTTON_STYLES = {
  primary: 'wf-btn-primary',
  secondary: 'wf-btn-secondary',
  quiet: 'wf-btn-quiet',
  danger: 'wf-btn-danger',
  'danger-primary': 'wf-btn-danger-primary',
  // Kept for existing call sites: a quiet progressive action.
  ghost: 'wf-btn border-transparent bg-transparent text-wiki-blue hover:bg-wiki-blue-light',
};

export function Button({ variant = 'primary', className, as: As = 'button', icon, children, ...rest }) {
  return (
    <As
      {...(As === 'button' && !rest.type ? { type: 'button' } : {})}
      className={cx(BUTTON_STYLES[variant] || BUTTON_STYLES.primary, className)}
      {...rest}
    >
      {icon ? <Icon name={icon} size="sm" /> : null}
      {children}
    </As>
  );
}

/** A square, icon-only button. `label` is required: it is the accessible name. */
export function IconButton({ icon, label, onClick, disabled, active, className, size = 'md', ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded border transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
        active
          ? 'border-wiki-blue bg-wiki-blue-light text-wiki-blue'
          : 'border-transparent text-wiki-ink hover:border-wiki-line hover:bg-wiki-paper',
        className
      )}
      {...rest}
    >
      <Icon name={icon} size={size === 'sm' ? 'sm' : 'md'} />
    </button>
  );
}

export function Field({ label, hint, error, children, required }) {
  return (
    <label className="block">
      <span className="wf-label">
        {label}
        {required ? <span className="ml-1 text-wiki-error">*</span> : null}
      </span>
      {children}
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-wiki-error">
          <Icon name="cdxIconError" size="xs" />
          {error}
        </p>
      ) : hint ? (
        <p className="wf-hint">{hint}</p>
      ) : null}
    </label>
  );
}

/** CAP-3 asks for inline explainers next to fields whose purpose is not obvious. */
export function Explainer({ children }) {
  return (
    <p className="wf-note flex gap-2">
      <Icon name="cdxIconLightbulb" size="sm" className="mt-0.5 text-wiki-blue" />
      <span>{children}</span>
    </p>
  );
}

const STATUS = {
  draft: ['Draft', 'bg-wiki-neutral text-wiki-ink ring-wiki-line'],
  active: ['Active', 'bg-wiki-success-bg text-wiki-success ring-wiki-success-border/40'],
  scheduled: ['Scheduled', 'bg-wiki-blue-light text-wiki-blue ring-wiki-blue/40'],
  inactive: ['Paused', 'bg-wiki-warning-bg text-wiki-warning ring-wiki-warning-border/40'],
  cancelled: ['Cancelled', 'bg-wiki-error-bg text-wiki-error ring-wiki-error-border/40'],
  ended: ['Ended', 'bg-wiki-paper text-wiki-slate ring-wiki-line'],
};

export function StatusBadge({ status }) {
  const [label, style] = STATUS[status] || STATUS.draft;
  return (
    <span className={cx('wf-chip px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide', style)}>
      {label}
    </span>
  );
}

export function Stat({ label, value, sub }) {
  return (
    <Card className="flex flex-col gap-1">
      <span className="text-xs font-bold uppercase tracking-wide text-wiki-slate">{label}</span>
      <span className="text-3xl font-bold text-wiki-ink">{value}</span>
      {sub ? <span className="text-xs text-wiki-slate">{sub}</span> : null}
    </Card>
  );
}

/** Codex ProgressIndicator (circular). */
export function Spinner({ label = 'Loading' }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-wiki-slate">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-wiki-line border-t-wiki-blue" />
      {label}
    </span>
  );
}

export function Empty({ title, body, action, icon = 'cdxIconImageGallery' }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-14 text-center">
      <Icon name={icon} size="xl" className="text-wiki-border" />
      <h3 className="text-lg font-bold">{title}</h3>
      <p className="max-w-md text-sm text-wiki-slate">{body}</p>
      {action}
    </Card>
  );
}

const MESSAGE = {
  error: ['cdxIconError', 'border-wiki-error-border bg-wiki-error-bg', 'text-wiki-error'],
  warning: ['cdxIconAlert', 'border-wiki-warning-border bg-wiki-warning-bg', 'text-wiki-warning'],
  success: ['cdxIconSuccess', 'border-wiki-success-border bg-wiki-success-bg', 'text-wiki-success'],
  info: ['cdxIconInfoFilled', 'border-wiki-blue/50 bg-wiki-blue-light', 'text-wiki-blue'],
  notice: ['cdxIconInfoFilled', 'border-wiki-muted bg-wiki-neutral', 'text-wiki-slate'],
};

/** Codex Message: an icon, a tinted surface, and optional dismissal. */
export function Alert({ tone = 'error', children, onDismiss, className }) {
  // `[null, false]` is truthy but renders nothing — treat it as empty.
  const hasContent = Array.isArray(children) ? children.some((c) => c || c === 0) : Boolean(children);
  if (!hasContent) return null;
  const [icon, surface, iconColor] = MESSAGE[tone] || MESSAGE.error;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('flex items-start gap-3 rounded border px-4 py-3 text-sm text-wiki-ink', surface, className)}
    >
      <Icon name={icon} className={cx('mt-0.5', iconColor)} />
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="-m-1 rounded p-1 text-wiki-slate hover:bg-wiki-ink/5"
          aria-label="Dismiss"
        >
          <Icon name="cdxIconClose" size="sm" />
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
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded bg-wiki-ink px-5 py-2.5
                 text-sm font-medium text-white shadow-float"
    >
      {message}
    </div>
  ) : null;

  return [node, setMessage];
}

/**
 * Codex Dialog. Focus moves into the dialog, Escape closes it, focus returns
 * to whatever opened it, and the page behind does not scroll.
 */
export function Dialog({ open, title, onClose, children, footer, size = 'md' }) {
  const panelRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const focusable = panelRef.current?.querySelector(
      'input, textarea, select, button:not([data-dialog-close]), [href], [tabindex]:not([tabindex="-1"])'
    );
    (focusable || panelRef.current)?.focus();

    function onKey(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
      }
      if (event.key === 'Tab') trapFocus(event, panelRef.current);
    }
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }[size] || 'max-w-lg';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-wiki-ink/60 p-4"
      onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx('flex max-h-full w-full flex-col rounded border border-wiki-line bg-white shadow-float', width)}
      >
        <header className="flex items-center justify-between gap-3 border-b border-wiki-line px-5 py-3">
          <h2 id={titleId} className="text-base font-bold">
            {title}
          </h2>
          {onClose ? (
            <button
              type="button"
              data-dialog-close
              onClick={onClose}
              className="-mr-2 rounded p-1.5 text-wiki-slate hover:bg-wiki-ink/5"
              aria-label="Close"
            >
              <Icon name="cdxIconClose" />
            </button>
          ) : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <footer className="flex flex-wrap justify-end gap-2 border-t border-wiki-line px-5 py-3">{footer}</footer>
        ) : null}
      </div>
    </div>
  );
}

function trapFocus(event, container) {
  if (!container) return;
  const items = [
    ...container.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    ),
  ].filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

const ConfirmContext = createContext(null);

/**
 * Promise-based confirmation in a Codex dialog, replacing window.confirm and
 * window.prompt. `typeToConfirm` asks for exact text first — used before
 * anything irreversible.
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title, body, confirmLabel, destructive: true })) …
 */
export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const [typed, setTyped] = useState('');

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        setTyped('');
        setRequest({ ...options, resolve });
      }),
    []
  );

  const close = (value) => {
    request?.resolve(value);
    setRequest(null);
  };

  const mustType = request?.typeToConfirm;
  const canConfirm = !mustType || typed === mustType;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={Boolean(request)}
        title={request?.title || 'Are you sure?'}
        onClose={() => close(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              {request?.cancelLabel || 'Cancel'}
            </Button>
            <Button
              variant={request?.destructive ? 'danger-primary' : 'primary'}
              disabled={!canConfirm}
              onClick={() => close(true)}
            >
              {request?.confirmLabel || 'Continue'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm leading-relaxed text-wiki-slate">
          {typeof request?.body === 'string' ? <p>{request.body}</p> : request?.body}
          {mustType ? (
            <label className="block">
              <span className="wf-label">
                Type <strong className="font-bold text-wiki-ink">{mustType}</strong> to confirm
              </span>
              <input
                className="wf-input"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canConfirm) close(true);
                }}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          ) : null}
        </div>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  // Outside a provider (should not happen) fall back to the browser dialog.
  return confirm || ((options) => Promise.resolve(window.confirm(options?.body || options?.title || '')));
}

export { formatDate, formatDateRange, toDateTimeLocal, pluralize } from '@/lib/format';
