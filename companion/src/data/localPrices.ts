// Free Market prices collected on this PC by `npm run prices:fetch` from NiaDB (MeowDB).
// The file is git-ignored, so the GitHub Pages build never has it and shows no prices; a
// local `npm run dev` / `npm run build` picks it up when it exists.

import type { SourceMeta } from '../models/types';

export interface LocalPrice {
  meowId: number;
  name: string;
  /** The item's NiaDB page (credit links here, per NiaDB's reuse policy). */
  url: string;
  price: number | null;
  sales: number;
  asOf: string | null;
  /** [day, median] for each day with sales, oldest first. */
  trend?: [string, number][];
  fetchedAt?: string;
}

interface PriceFile {
  retrieved_at?: string;
  items: Record<string, LocalPrice>;
}

// Optional import: an empty object when the file isn't there.
const files = import.meta.glob<PriceFile>('../../data-local/meowdb-prices.json', { eager: true, import: 'default' });
const file: PriceFile | undefined = Object.values(files)[0];

export const LOCAL_PRICES: Record<string, LocalPrice> = file?.items ?? {};
export const hasLocalPrices = Object.keys(LOCAL_PRICES).length > 0;

export const localPriceFor = (gameId: number): LocalPrice | undefined => {
  const p = LOCAL_PRICES[gameId];
  return p && p.price ? p : undefined;
};

/** Older than a week: Free Market prices move fast. */
export const isStale = (p: LocalPrice, now = Date.now()) => !p.fetchedAt || now - Date.parse(p.fetchedAt) > 7 * 864e5;

export const priceSource = (p: LocalPrice): SourceMeta => ({
  source_url: p.url,
  source_title: `NiaDB: ${p.name} price`,
  retrieved_at: (p.fetchedAt ?? '').slice(0, 10),
  game_version_or_date: p.asOf ?? '',
  verification_status: 'community_reported',
  notes: `Usual Free Market price: sales-weighted median of the last week with sales (${p.sales} sales).`,
});

/** Short mesos, e.g. 1,999 -> "2K", 1,490,000 -> "1.49M". */
export function shortMesos(n: number): string {
  if (n >= 1e9) return `${+(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${Math.round(n / 1e3)}K`;
  return n.toLocaleString();
}
