// Formatting helpers shared by server and client components. Kept out of
// components/ui.jsx because that file is a client module and server components
// cannot import from it.

export function formatDate(value, opts) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...opts,
  });
}

export function formatDateRange(start, end) {
  const from = formatDate(start);
  const to = formatDate(end);
  return from === to ? from : `${from} – ${to}`;
}

/** Value shape required by <input type="datetime-local">. */
export function toDateTimeLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural ?? `${singular}s`}`;
}
