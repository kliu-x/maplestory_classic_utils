import type { ChatOffer } from '../integrations/expTrackerImport';

// Asking prices from the game's chat (B> / S> offers read by the Maple EXP Tracker). These are what players ask or
// bid, never what an item sold for, so they're summarised separately from sale prices. Pure.

const fold = (s: string) =>
  ` ${s
    .toLowerCase()
    .replace(/[\[\]()!*~'"`]/g, ' ')
    .replace(/[^a-z0-9%+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;

export interface NamedItem {
  id: number;
  name: string;
  /** Level needed, when known: an offer that names a different level ("lvl 50 crossbow") isn't this item. */
  reqLevel?: number;
}

/** A level written in an offer: "lvl 50", "lv50", "level 50", "l50". */
export function writtenLevel(written: string): number | null {
  const m = /\b(?:lvl|lv|level|l)\.?\s?(\d{1,3})\b/i.exec(written);
  return m ? Number(m[1]) : null;
}

/**
 * The game item an offer is about: the longest item name (4+ letters) found as whole words in what was written.
 * Null when nothing fits; then the offer is shown as written and never tied to a guessed item.
 */
export function matchOfferItem<T extends NamedItem>(written: string, items: T[], index = nameIndex(items)): T | null {
  const t = fold(written);
  const lv = writtenLevel(written);
  let best: T | null = null;
  for (const [n, it] of index) {
    if (n.length - 2 < 4 || !t.includes(n)) continue;
    if (lv != null && it.reqLevel && it.reqLevel !== lv) continue;
    if (!best || n.length > fold(best.name).length) best = it;
  }
  return best;
}

/** Folded name → item, built once for a list (first item wins when two share a name). */
export function nameIndex<T extends NamedItem>(items: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const it of items) {
    const n = fold(it.name);
    if (!m.has(n)) m.set(n, it);
  }
  return m;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface AskSummary {
  /** Offers counted (each offer once, however often it was repeated). */
  sells: number;
  buys: number;
  sellLow: number | null;
  sellMedian: number | null;
  buyHigh: number | null;
  buyMedian: number | null;
  /** Offers with no price ("PMO"). */
  pmo: number;
  /** Newest sighting, "YYYY-MM-DD HH:MM:SS". */
  lastSeen: string | null;
  /** How many different players. */
  players: number;
}

/** Summary of a set of offers for one item. Per-item ("each") and whole-stack prices are kept as written. */
export function summarizeAsks(offers: ChatOffer[]): AskSummary {
  const priced = (side: 'B' | 'S') => offers.filter((o) => o.side === side && o.price != null && o.price > 0).map((o) => o.price as number);
  const sells = priced('S');
  const buys = priced('B');
  const last = offers.map((o) => o.lastSeen ?? o.id).sort().pop() ?? null;
  return {
    sells: offers.filter((o) => o.side === 'S').length,
    buys: offers.filter((o) => o.side === 'B').length,
    sellLow: sells.length ? Math.min(...sells) : null,
    sellMedian: median(sells),
    buyHigh: buys.length ? Math.max(...buys) : null,
    buyMedian: median(buys),
    pmo: offers.filter((o) => o.price == null && o.pmo).length,
    lastSeen: last ? last.slice(0, 19) : null,
    players: new Set(offers.map((o) => o.player.toLowerCase()).filter(Boolean)).size,
  };
}

/** Short mesos text as chat writes it: 950, 12k, 2.5m, 1.2b. */
export function shortMesos(n: number): string {
  for (const [lim, suf] of [[1e9, 'b'], [1e6, 'm'], [1e3, 'k']] as const) {
    if (n >= lim) return `${+(n / lim).toFixed(2)}${suf}`;
  }
  return String(Math.round(n));
}
