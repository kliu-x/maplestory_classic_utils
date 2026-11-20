import { isStale, localPriceFor, shortMesos } from '../data/localPrices';

/** A tiny line of the daily median prices (no axes): the shape of the last 30 days. */
export function Sparkline({ points, width = 56, height = 18 }: { points: number[]; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || 1;
  const xy = points.map((v, i) => `${((i / (points.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 1 - ((v - lo) / span) * (height - 2)).toFixed(1)}`);
  const up = points[points.length - 1] >= points[0];
  return (
    <svg className={`spark ${up ? 'up' : 'down'}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={xy.join(' ')} fill="none" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** The usual price NiaDB shows for an item, collected on this PC, with its trend. Nothing when there's no local price file. */
export function PriceTag({ gameId }: { gameId: number }) {
  const p = localPriceFor(gameId);
  if (!p?.price) return null;
  const stale = isStale(p);
  const days = p.trend?.map(([, v]) => v) ?? [];
  return (
    <a
      className={`price-tag ${stale ? 'stale' : ''}`}
      href={p.url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Usual price ${p.price.toLocaleString()} mesos (${p.sales} sales in the week to ${p.asOf}). Source: NiaDB, fetched ${p.fetchedAt?.slice(0, 10)}${stale ? ', over a week ago' : ''}.`}
    >
      <Sparkline points={days} />
      <strong>{shortMesos(p.price)}</strong>
    </a>
  );
}
