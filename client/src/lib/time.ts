import { useEffect, useState } from 'react';

const rtf = new Intl.RelativeTimeFormat('es-CL', { numeric: 'auto' });
const abs = new Intl.DateTimeFormat('es-CL', {
  timeZone: 'America/Santiago',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** "hace 3 minutos", "ayer", etc. */
export function timeAgo(ms: number, now = Date.now()): string {
  const s = Math.round((ms - now) / 1000);
  if (s > -45) return 'recién';
  const m = Math.round(s / 60);
  if (m > -60) return rtf.format(m, 'minute');
  const h = Math.round(m / 60);
  if (h > -24) return rtf.format(h, 'hour');
  return rtf.format(Math.round(h / 24), 'day');
}

export function fullDate(ms: number): string {
  return abs.format(ms);
}

/** Re-renderiza cada `ms` para que los "hace X min" se mantengan al día. */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
