import { expForLevel } from '../data/expTable';

// The EXP curve: per-level (marginal) and running total (cumulative) EXP. Pure, from the EXP table.

export const MAX_LEVEL = 100;

export interface CurvePoint {
  level: number;
  /** EXP to go from `level` to `level + 1` (0 at the cap). */
  marginal: number;
  /** Total EXP earned from level 1 to reach `level`. */
  cumulative: number;
  /** How much more this level's EXP-to-next is than the previous level's (null at level 1 and the cap). */
  increase: number | null;
}

/** One point per level 1..MAX_LEVEL. */
export function expCurve(): CurvePoint[] {
  const out: CurvePoint[] = [];
  let total = 0;
  for (let level = 1; level <= MAX_LEVEL; level++) {
    const marginal = expForLevel(level);
    const prev = level > 1 ? expForLevel(level - 1) : 0;
    out.push({ level, marginal, cumulative: total, increase: level > 1 && marginal > 0 ? marginal - prev : null });
    total += marginal;
  }
  return out;
}

/** Total EXP from level 1 to reach `level`. */
export function cumulativeExp(level: number): number {
  let t = 0;
  for (let l = 1; l < Math.min(Math.round(level), MAX_LEVEL + 1); l++) t += expForLevel(l);
  return t;
}

/** Share (0..1) of all the EXP to the cap already behind you at `level` (+ current EXP into it). */
export function shareOfJourney(level: number, currentExp = 0): number {
  const all = cumulativeExp(MAX_LEVEL);
  return all > 0 ? Math.min(1, (cumulativeExp(level) + Math.max(0, currentExp)) / all) : 0;
}

/** The first level at which `fraction` (0..1) of all the EXP to the cap is behind you. */
export function levelAtShare(fraction: number): number {
  for (const p of expCurve()) if (shareOfJourney(p.level) >= fraction) return p.level;
  return MAX_LEVEL;
}
