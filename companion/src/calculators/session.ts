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
  /** Readings thrown out as misreads (EXP going backwards, impossible jumps). */
  rejected: number;
}

export interface SessionOptions {
  /** MP one cast costs; turns MP drops into a cast count. */
  mpPerCast?: number;
  /** A gap this long (s) with no EXP gained counts as a break, not hunting. */
  idleAfter?: number;
}

/** Keep EXP readings that make sense: never backwards within a level, no absurd jumps unless the next reading agrees. */
function cleanExp(samples: Sample[]): { kept: Sample[]; rejected: number } {
  const withExp = samples.filter((s) => s.exp != null && s.level != null);
  const kept: Sample[] = [];
  let rejected = 0;
  for (let i = 0; i < withExp.length; i++) {
    const s = withExp[i];
    const prev = kept[kept.length - 1];
    if (!prev) {
      kept.push(s);
      continue;
    }
    const sameLevel = s.level === prev.level;
    const levelUp = s.level === prev.level! + 1;
    const gain = sameLevel ? s.exp! - prev.exp! : levelUp ? expForLevel(prev.level!) - prev.exp! + s.exp! : NaN;
    // A jump of more than 10% of a level is a misread unless the next reading confirms it.
    const big = gain > expForLevel(prev.level!) * 0.1;
    const next = withExp[i + 1];
    const confirmed = !big || (next != null && next.level === s.level && next.exp! >= s.exp!);
    if (Number.isFinite(gain) && gain >= 0 && confirmed) kept.push(s);
    else rejected++;
  }
  return { kept, rejected };
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
    const g = b.level === a.level ? b.exp! - a.exp! : expForLevel(a.level!) - a.exp! + b.exp!;
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
  const mp = samples.filter((s) => s.mp != null);
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
