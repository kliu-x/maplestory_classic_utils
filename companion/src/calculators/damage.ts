// Casts-to-kill from a per-line damage range. Pure functions, no game data.
//
// Per-line damage on a hit is modelled as a triangular distribution on [min, max] whose
// mode is chosen so the mean equals the measured average (clamped into range). Each line
// hits independently with probability hitRate.
//
// Exact method (fast):
//   1. P(N = n): distribution of the number of HITS needed to kill, by convolving the hit
//      damage distribution on a discretised HP grid (absorbing "dead" state).
//   2. Misses folded in analytically: after c casts (t = c * lines attempts),
//      P(dead) = sum_n P(N = n) * P(Binomial(t, hitRate) >= n).
// Very slow kills (> MAX_EXACT_HITS hits) fall back to a mean-based approximation.

export interface LineDamage {
  min: number;
  avg: number;
  max: number;
  hitRate: number; // 0..1
}

export interface KillStats {
  /** Expected casts to kill, E[N]. Infinity if it cannot be killed. */
  expected: number;
  /** Fewest casts possible (every line hits for max). */
  best: number;
  /** Casts needed if every line hits for min. Infinity when lines can miss. */
  worstNoMiss: number;
  /** Casts by which the kill probability reaches 50% / 90%. */
  median: number;
  p90: number;
  /** P(killed within n casts) for n = 1..length (empty when approximated). */
  cumulative: number[];
  deterministic: boolean;
  approximate?: boolean;
}

const GRID = 400;
const MAX_EXACT_HITS = 400;
const MAX_CASTS = 3000;
const DONE = 1 - 1e-6;

export function normalizeLine(d: LineDamage): LineDamage {
  const min = Math.max(0, Math.min(d.min, d.max));
  const max = Math.max(d.min, d.max, 0);
  const avg = Math.min(max, Math.max(min, d.avg || (min + max) / 2));
  const hitRate = Math.min(1, Math.max(0, Number.isFinite(d.hitRate) ? d.hitRate : 1));
  return { min, avg, max, hitRate };
}

/** Mean damage of one line, including misses. */
export function expectedLine(d: LineDamage): number {
  const n = normalizeLine(d);
  return n.avg * n.hitRate;
}

/** Damage distribution of one HIT on a grid of bin width w (index = bins of damage). */
function hitPmf(d: LineDamage, w: number): Float64Array {
  const { min, avg, max } = d;
  const hiBin = Math.floor(max / w + 1e-9);
  const pmf = new Float64Array(Math.min(hiBin, GRID) + 1);
  if (max - min < 1e-9) {
    pmf[Math.min(hiBin, GRID)] = 1;
    return pmf;
  }
  const mode = Math.min(max, Math.max(min, 3 * avg - min - max));
  const cdf = (x: number) => {
    if (x <= min) return 0;
    if (x >= max) return 1;
    if (x <= mode) return mode === min ? 0 : ((x - min) ** 2) / ((max - min) * (mode - min));
    return 1 - ((max - x) ** 2) / ((max - min) * (max - mode));
  };
  for (let b = Math.floor(min / w + 1e-9); b <= hiBin; b++) {
    const p = cdf(Math.min(max, (b + 1) * w)) - cdf(Math.max(min, b * w));
    if (p > 0) pmf[Math.min(b, GRID)] += p;
  }
  return pmf;
}

/** P(N = n) for n = 0..length-1, N = hits needed to reach hp. Null if too many hits. */
function hitsNeeded(hp: number, d: LineDamage): number[] | null {
  if (hp / d.avg > MAX_EXACT_HITS) return null;
  const w = hp / GRID;
  const pmf = hitPmf(d, w);
  let alive = new Float64Array(GRID);
  alive[0] = 1;
  let dead = 0;
  const dist = [0];
  for (let n = 1; n <= MAX_EXACT_HITS * 2 && dead < DONE; n++) {
    const next = new Float64Array(GRID);
    const before = dead;
    for (let i = 0; i < GRID; i++) {
      const a = alive[i];
      if (a < 1e-15) continue;
      for (let j = 0; j < pmf.length; j++) {
        const p = pmf[j];
        if (p === 0) continue;
        const k = i + j;
        if (k >= GRID) dead += a * p;
        else next[k] += a * p;
      }
    }
    alive = next;
    dist.push(dead - before);
  }
  return dead >= DONE ? dist : null;
}

/** P(Binomial(t, p) >= n) for n = 0..maxN, computed in log space. */
function binomTail(t: number, p: number, maxN: number): number[] {
  const tail = new Array(maxN + 1).fill(0);
  if (p >= 1) {
    for (let n = 0; n <= maxN; n++) tail[n] = t >= n ? 1 : 0;
    return tail;
  }
  // pmf(k) for k = 0..min(t, maxN-1); tail(n) = 1 - cdf(n-1)
  const lq = Math.log1p(-p);
  const lr = Math.log(p) - lq;
  let logPmf = t * lq;
  let cdf = 0;
  tail[0] = 1;
  for (let k = 0; k < maxN; k++) {
    if (k > t) {
      tail[k + 1] = 0;
      continue;
    }
    cdf += Math.exp(logPmf);
    tail[k + 1] = Math.max(0, 1 - cdf);
    logPmf += Math.log(t - k) - Math.log(k + 1) + lr;
  }
  return tail;
}

export function castsToKill(hp: number, line: LineDamage, linesPerCast = 1): KillStats {
  const d = normalizeLine(line);
  const lines = Math.max(1, Math.round(linesPerCast));
  const perCastMax = d.max * lines;
  const best = perCastMax > 0 ? Math.ceil(hp / perCastMax) : Infinity;
  const worstNoMiss = d.hitRate >= 1 && d.min > 0 ? Math.ceil(hp / (d.min * lines)) : Infinity;
  const deterministic = d.hitRate >= 1 && d.max - d.min < 1e-9;
  if (hp <= 0) return { expected: 0, best: 0, worstNoMiss: 0, median: 0, p90: 0, cumulative: [], deterministic: true };
  if (!(d.max > 0) || d.hitRate <= 0) {
    return { expected: Infinity, best: Infinity, worstNoMiss: Infinity, median: Infinity, p90: Infinity, cumulative: [], deterministic };
  }
  if (deterministic) {
    const cumulative = Array.from({ length: best }, (_, i) => (i + 1 >= best ? 1 : 0));
    return { expected: best, best, worstNoMiss: best, median: best, p90: best, cumulative, deterministic };
  }

  const hits = hitsNeeded(hp, d);
  if (!hits) {
    // Hundreds of hits: report the mean (Wald: E[lines] = E[hits] / p) and a rough spread.
    const expected = Math.ceil(hp / d.avg) / d.hitRate / lines + 0.5;
    return { expected, best, worstNoMiss, median: Math.round(expected), p90: Math.ceil(expected * 1.1), cumulative: [], deterministic: false, approximate: true };
  }

  const maxN = hits.length - 1;
  const cumulative: number[] = [];
  let expected = 0;
  let dead = 0;
  for (let c = 1; c <= MAX_CASTS; c++) {
    expected += 1 - dead; // P(casts >= c)
    const tail = binomTail(c * lines, d.hitRate, maxN);
    dead = 0;
    for (let n = 1; n <= maxN; n++) dead += hits[n] * tail[n];
    cumulative.push(Math.min(1, dead));
    if (dead >= 0.9999) break;
  }
  if (dead < 0.9999) expected = Infinity;
  const firstAt = (p: number) => {
    const i = cumulative.findIndex((x) => x >= p);
    return i < 0 ? Infinity : i + 1;
  };
  return { expected, best, worstNoMiss, median: firstAt(0.5), p90: firstAt(0.9), cumulative, deterministic };
}
