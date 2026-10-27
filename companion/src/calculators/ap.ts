// AP suggestions: meet gear stat requirements with the fewest points, everything else
// into the main stat. Equipment bonuses count toward requirements, so they lower the
// base AP needed (but if you remove that gear, you may lose access to the item).

import type { JobId, JobInfo, StatKey, Stats } from '../models/types';
import { JOBS, RULES } from '../data/rules';

/** Community-reported starting stats (12/5/4/4) sum to 25. */
export const STARTING_STAT_TOTAL = 25;

/** Starting stats for a class: 12 in the main stat, 5 in the second, 4 in the rest. */
export function startingStats(job: JobId): Stats {
  const info = JOBS[job];
  const out: Stats = { str: 4, dex: 4, int: 4, luk: 4 };
  out[info.primaryStat] = 12;
  out[info.secondaryStat ?? (info.primaryStat === 'str' ? 'dex' : 'str')] = 5;
  return out;
}

/** Typical base stats at a level: starting stats plus every AP in the main stat. A default to edit, not a recommendation. */
export function expectedBase(job: JobId, level: number): Stats {
  const out = startingStats(job);
  out[JOBS[job].primaryStat] += RULES.apPerLevel.value * (Math.max(1, Math.round(level)) - 1);
  return out;
}

export function expectedBaseTotal(level: number): number {
  return STARTING_STAT_TOTAL + RULES.apPerLevel.value * (Math.max(1, level) - 1);
}

export function unspentAp(level: number, base: Stats): number {
  const sum = base.str + base.dex + base.int + base.luk;
  return expectedBaseTotal(level) - sum;
}

export interface ApNeed {
  stat: StatKey;
  goalTotal: number;
  equip: number;
  base: number;
  /** Base AP still needed for the goal (0 if met). */
  needed: number;
}

export function apNeeds(base: Stats, equip: Stats, goals: Partial<Stats>): ApNeed[] {
  return (Object.keys(goals) as StatKey[])
    .filter((k) => (goals[k] ?? 0) > 0)
    .map((k) => {
      const goalTotal = goals[k] ?? 0;
      const needed = Math.max(0, goalTotal - equip[k] - base[k]);
      return { stat: k, goalTotal, equip: equip[k], base: base[k], needed };
    });
}

export interface ApSuggestion {
  stat: StatKey;
  amount: number;
  reason: string;
}

/** Suggest how to spend the next `points` AP (default: one level's worth). */
export function suggestAp(job: JobInfo, base: Stats, equip: Stats, goals: Partial<Stats>, points = RULES.apPerLevel.value): ApSuggestion[] {
  let left = points;
  const out: ApSuggestion[] = [];
  for (const need of apNeeds(base, equip, goals).sort((a, b) => a.needed - b.needed)) {
    if (need.stat === job.primaryStat || need.needed === 0 || left === 0) continue;
    const amt = Math.min(left, need.needed);
    out.push({
      stat: need.stat,
      amount: amt,
      reason: `Reach ${need.stat.toUpperCase()} ${need.goalTotal} for gear (${need.equip} from equipment already counts).`,
    });
    left -= amt;
  }
  if (left > 0) out.push({ stat: job.primaryStat, amount: left, reason: `Main stat for ${job.label} damage.` });
  return out;
}
