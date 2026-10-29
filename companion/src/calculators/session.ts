// Turn status-bar readings taken while you play into a training report. EXP and MP are
// running totals, so a missed frame loses nothing: the next reading carries the change.

import { expForLevel } from '../data/expTable';

export interface Sample {
  /** Seconds since the session started. */
  t: number;
  level?: number;
  exp?: number;
  mp?: number;
  mpMax?: number;
}

export interface SessionReport {
  seconds: number;
  activeSeconds: number;
  expGained: number;
  expPerMin: number;
  /** EXP per minute counting only time spent hunting (breaks over `idleAfter` excluded). */
  expPerActiveMin: number;
  levelUps: number;
  kills: number;
  /** The EXP one kill gave most often (spot party/event bonuses by comparing to the monster's EXP). */
  expPerKill: number | null;
  casts: number | null;
  castsPerKill: number | null;
  mpUsed: number;
  mpPerMin: number;
  potions: number;
  readings: number;
  /** The first and last trustworthy readings (level bar, "time to level", the profile). */
  first: Sample | null;
  last: Sample | null;
  /** Readings thrown out as misreads (EXP going backwards, impossible jumps). */
  rejected: number;
}

export interface SessionOptions {
  /** MP one cast costs; turns MP drops into a cast count. */
  mpPerCast?: number;
  /** A gap this long (s) with no EXP gained counts as a break, not hunting. */
  idleAfter?: number;
}

/** EXP earned since level 1: lets readings on either side of a level-up be compared directly. */
function totalExp(s: Sample): number {
  let sum = s.exp!;
  for (let l = 1; l < s.level!; l++) sum += expForLevel(l);
  return sum;
}

/** Fastest believable gain: 0.2% of a level per second (12% a minute), plus one reading's worth. */
const MAX_SHARE_PER_SECOND = 0.002;

/**
 * Keep the readings that tell one consistent story: the longest chain where total EXP never
 * goes down and never climbs faster than anyone could earn it. A misread can repeat while the
 * screen is still, so "the next reading agrees" proves nothing; the true readings are simply
 * the majority, and a wrong level or digit breaks the chain and drops out.
 */
function cleanExp(samples: Sample[]): { kept: Sample[]; rejected: number } {
  const xs = samples.filter((s) => s.exp != null && s.level != null && s.level >= 1 && s.exp < expForLevel(s.level));
  const tot = xs.map(totalExp);
  const best = xs.map(() => 1);
  const from = xs.map(() => -1);
  for (let j = 0; j < xs.length; j++) {
    const cap = expForLevel(xs[j].level!) * MAX_SHARE_PER_SECOND;
    for (let i = Math.max(0, j - 600); i < j; i++) {
      const gain = tot[j] - tot[i];
      const dt = xs[j].t - xs[i].t;
      if (gain >= 0 && gain <= cap * Math.max(dt, 1.5) && best[i] + 1 > best[j]) {
        best[j] = best[i] + 1;
        from[j] = i;
      }
    }
  }
  let end = -1;
  for (let j = 0; j < xs.length; j++) if (end < 0 || best[j] >= best[end]) end = j;
  const kept: Sample[] = [];
  for (let j = end; j >= 0; j = from[j]) kept.unshift(xs[j]);
  return { kept, rejected: samples.filter((s) => s.exp != null).length - kept.length };
}

export function summarize(samples: Sample[], opts: SessionOptions = {}): SessionReport {
  const idleAfter = opts.idleAfter ?? 30;
  const seconds = samples.length ? samples[samples.length - 1].t - samples[0].t : 0;
  const { kept, rejected } = cleanExp(samples);

  let expGained = 0;
  let levelUps = 0;
  const gains: { t: number; amount: number }[] = [];
  for (let i = 1; i < kept.length; i++) {
    const a = kept[i - 1], b = kept[i];
    const g = totalExp(b) - totalExp(a);
    if (b.level !== a.level) levelUps++;
    if (g > 0) {
      expGained += g;
      gains.push({ t: b.t, amount: g });
    }
  }

  // EXP per kill: the most common gain (one kill per reading is the usual case).
  const counts = new Map<number, number>();
  for (const g of gains) counts.set(g.amount, (counts.get(g.amount) ?? 0) + 1);
  const mode = [...counts].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0];
  const expPerKill = mode && mode[1] >= 2 ? mode[0] : gains.length ? Math.min(...gains.map((g) => g.amount)) : null;
  const kills = expPerKill ? gains.reduce((n, g) => n + Math.max(1, Math.round(g.amount / expPerKill)), 0) : 0;

  // Breaks: long gaps between EXP gains.
  let idle = 0;
  let last = samples[0]?.t ?? 0;
  for (const g of gains) {
    if (g.t - last > idleAfter) idle += g.t - last - idleAfter;
    last = g.t;
  }
  const end = samples[samples.length - 1]?.t ?? 0;
  if (end - last > idleAfter) idle += end - last - idleAfter;
  const activeSeconds = Math.max(0, seconds - idle);

  // MP: drops are casts, rises are potions (or level-up refills).
  let mpUsed = 0;
  let potions = 0;
  let casts = 0;
  // Only readings that agree on Max MP (the most common one) and fit under it.
  const maxes = new Map<number, number>();
  for (const s of samples) if (s.mpMax) maxes.set(s.mpMax, (maxes.get(s.mpMax) ?? 0) + 1);
  const mpMax = [...maxes].sort((x, y) => y[1] - x[1])[0]?.[0];
  const mp = samples.filter((s) => s.mp != null && (!mpMax || (s.mpMax === mpMax && s.mp <= mpMax)));
  for (let i = 1; i < mp.length; i++) {
    const d = mp[i].mp! - mp[i - 1].mp!;
    if (d < 0) {
      mpUsed -= d;
      if (opts.mpPerCast) casts += Math.max(1, Math.round(-d / opts.mpPerCast));
    } else if (d > 0) potions++;
  }

  const perMin = (x: number, s: number) => (s > 0 ? (x * 60) / s : 0);
  return {
    seconds,
    activeSeconds,
    expGained,
    expPerMin: perMin(expGained, seconds),
    expPerActiveMin: perMin(expGained, activeSeconds),
    levelUps,
    kills,
    expPerKill,
    casts: opts.mpPerCast ? casts : null,
    castsPerKill: opts.mpPerCast && kills ? casts / kills : null,
    mpUsed,
    mpPerMin: perMin(mpUsed, seconds),
    potions,
    readings: samples.length,
    first: kept[0] ?? null,
    last: kept[kept.length - 1] ?? null,
    rejected,
  };
}

/**
 * Which monsters give exactly this much EXP per kill (most EXP values in Classic World
 * belong to one monster: 28 is Bubbling). Bosses and monsters with no spawns are skipped.
 */
export function monstersGiving<M extends { exp: number; isBoss: boolean; spawns: unknown[] }>(monsters: M[], expPerKill: number | null): M[] {
  if (!expPerKill) return [];
  return monsters.filter((m) => !m.isBoss && m.spawns.length > 0 && m.exp === expPerKill);
}

/** A per-minute amount (MP, mesos, stars) per EXP gained over the same minutes. Null when no EXP was gained. */
export function perExp(perMin: number, expPerMin: number): number | null {
  return expPerMin > 0 ? perMin / expPerMin : null;
}
