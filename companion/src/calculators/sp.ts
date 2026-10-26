// SP pools and allocation validation. Rules come from data/rules.ts (with sources).

import type { Skill } from '../models/types';
import { RULES, jobTierOfGameJob, skillJobId } from '../data/rules';

export interface SpPools {
  beginner: number;
  first: number;
  second: number;
  /** SP earned past Lv 30 while still 1st job (cannot be spent until 2nd job). */
  pendingSecond: number;
  /** SP earned after every available 2nd-job skill is maxed is reported separately by the UI. */
}

export function spPools(level: number, tier: 0 | 1 | 2): SpPools {
  const lv = Math.max(1, Math.min(RULES.maxLevel.value, Math.floor(level)));
  const j1 = RULES.firstJobLevel.value;
  const j2 = RULES.secondJobLevel.value;
  const per = RULES.spPerLevel.value;
  const adv = RULES.spAtAdvancement.value;
  const beginner = (Math.min(lv, j1) - 1) * RULES.beginnerSpPerLevel.value;
  if (tier === 0 || lv < j1) return { beginner, first: 0, second: 0, pendingSecond: 0 };
  const first = adv + per * (Math.min(lv, j2) - j1);
  if (tier === 1) return { beginner, first, second: 0, pendingSecond: lv > j2 ? per * (lv - j2) : 0 };
  const second = lv >= j2 ? adv + per * (lv - j2) : 0;
  return { beginner, first, second, pendingSecond: 0 };
}

/** SP gained when reaching `level` (for level-by-level tables). */
export function spGainedAt(level: number, tier: 1 | 2): number {
  const j1 = RULES.firstJobLevel.value;
  const j2 = RULES.secondJobLevel.value;
  if (tier === 1) {
    if (level === j1) return RULES.spAtAdvancement.value;
    return level > j1 && level <= j2 ? RULES.spPerLevel.value : 0;
  }
  if (level === j2) return RULES.spAtAdvancement.value;
  return level > j2 ? RULES.spPerLevel.value : 0;
}

export interface AllocationIssue {
  skillId: number;
  kind: 'over_cap' | 'prereq' | 'pool' | 'unknown_skill' | 'negative';
  message: string;
}

export function spentByTier(alloc: Record<number, number>): { first: number; second: number; beginner: number } {
  const out = { first: 0, second: 0, beginner: 0 };
  for (const [id, lv] of Object.entries(alloc)) {
    const t = jobTierOfGameJob(skillJobId(Number(id)));
    if (t === 0) out.beginner += lv;
    else if (t === 1) out.first += lv;
    else out.second += lv;
  }
  return out;
}

export function validateAllocation(
  skills: Skill[],
  alloc: Record<number, number>,
  level: number,
  tier: 0 | 1 | 2,
): AllocationIssue[] {
  const issues: AllocationIssue[] = [];
  const byId = new Map(skills.map((s) => [s.id, s]));
  for (const [idStr, lv] of Object.entries(alloc)) {
    const id = Number(idStr);
    if (!lv) continue;
    const s = byId.get(id);
    if (!s) {
      issues.push({ skillId: id, kind: 'unknown_skill', message: `Skill ${id} is not available to this job.` });
      continue;
    }
    if (lv < 0) issues.push({ skillId: id, kind: 'negative', message: `${s.name}: negative level.` });
    if (lv > s.masterLevel) issues.push({ skillId: id, kind: 'over_cap', message: `${s.name}: ${lv} exceeds max level ${s.masterLevel}.` });
    for (const p of s.prereqs) {
      if ((alloc[p.skillId] ?? 0) < p.level) {
        const pre = byId.get(p.skillId)?.name ?? `skill ${p.skillId}`;
        issues.push({ skillId: id, kind: 'prereq', message: `${s.name} needs ${pre} Lv ${p.level}.` });
      }
    }
  }
  const pools = spPools(level, tier);
  const spent = spentByTier(alloc);
  if (spent.first > pools.first)
    issues.push({ skillId: 0, kind: 'pool', message: `1st-job skills use ${spent.first} SP but only ${pools.first} are available at Lv ${level}.` });
  if (spent.second > pools.second)
    issues.push({ skillId: 0, kind: 'pool', message: `2nd-job skills use ${spent.second} SP but only ${pools.second} are available at Lv ${level}.` });
  return issues;
}
