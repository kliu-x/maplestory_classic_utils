// Odds for random boxes (Mystery Fashion Crates). Each open is independent at the published rate.

export interface CratePrice {
  one: number;
  bundle?: { count: number; price: number };
}

/** Chance of getting a piece at least once in `opens` crates. `ratePct` is the published % (e.g. 2 for 2%). */
export function chanceInOpens(ratePct: number, opens: number): number {
  const p = ratePct / 100;
  if (p <= 0 || opens <= 0) return 0;
  if (p >= 1) return 1;
  return 1 - Math.pow(1 - p, opens);
}

/** Average number of crates until the piece drops (1 / rate). */
export function averageOpens(ratePct: number): number {
  return ratePct > 0 ? 100 / ratePct : Infinity;
}

/** Crates needed to have the piece with probability `confidence` (0..1), e.g. 0.5 for a coin flip. */
export function opensForChance(ratePct: number, confidence: number): number {
  const p = ratePct / 100;
  if (p <= 0) return Infinity;
  if (p >= 1 || confidence <= 0) return 1;
  if (confidence >= 1) return Infinity;
  return Math.max(1, Math.ceil(Math.log(1 - confidence) / Math.log(1 - p)));
}

/** Cheapest way to buy `opens` crates: as many bundles as fit, then singles or one more bundle, whichever is less. */
export function costOfOpens(opens: number, price: CratePrice): number {
  if (!Number.isFinite(opens) || opens <= 0) return opens > 0 ? Infinity : 0;
  const b = price.bundle;
  if (!b || b.price >= b.count * price.one) return opens * price.one;
  const bundles = Math.floor(opens / b.count);
  const rest = opens - bundles * b.count;
  return bundles * b.price + Math.min(rest * price.one, rest ? b.price : 0);
}
