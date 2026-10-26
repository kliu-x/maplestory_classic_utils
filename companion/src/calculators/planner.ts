// Turn a build order into per-SP suggestions and a level-by-level table.

import type { Build } from '../data/builds';
import { RULES } from '../data/rules';
import { spGainedAt } from './sp';

/** One entry per skill point, in build order, with the step it came from. */
function expandSteps(build: Build): { skillId: number; why?: string }[] {
  const current: Record<number, number> = {};
  const seq: { skillId: number; why?: string }[] = [];
  for (const step of build.steps) {
    const have = current[step.skillId] ?? 0;
    for (let i = have; i < step.to; i++) seq.push({ skillId: step.skillId, why: step.why });
    current[step.skillId] = Math.max(have, step.to);
  }
  return seq;
}

/** One skill id per skill point, in build order. */
export function expandBuild(build: Build): number[] {
  return expandSteps(build).map((s) => s.skillId);
}

export function finalAllocation(build: Build): Record<number, number> {
  const out: Record<number, number> = {};
  for (const id of expandBuild(build)) out[id] = (out[id] ?? 0) + 1;
  return out;
}

export interface SpSuggestion {
  skillId: number;
  from: number;
  to: number;
  why?: string;
}

/** Next `n` single-SP suggestions given what the character already has. */
export function nextSp(build: Build, alloc: Record<number, number>, n: number): SpSuggestion[] {
  const virtual: Record<number, number> = {};
  const assumed: Record<number, number> = { ...alloc };
  const out: SpSuggestion[] = [];
  for (const { skillId: id, why } of expandSteps(build)) {
    virtual[id] = (virtual[id] ?? 0) + 1;
    const have = assumed[id] ?? 0;
    if (have >= virtual[id]) continue;
    out.push({ skillId: id, from: have, to: have + 1, why });
    assumed[id] = have + 1;
    if (out.length >= n) break;
  }
  return out;
}

export interface LevelRow {
  level: number;
  sp: number;
  points: { skillId: number; to: number }[];
  unspent: number; // SP that has no build step left (e.g. everything maxed)
}

/** What to put SP into at each level, from the build's advancement level up to `toLevel`. */
export function levelTable(build: Build, toLevel: number): LevelRow[] {
  const seq = expandBuild(build);
  const start = build.tier === 1 ? RULES.firstJobLevel.value : RULES.secondJobLevel.value;
  const end = build.tier === 1 ? Math.min(toLevel, RULES.secondJobLevel.value) : toLevel;
  const levels: Record<number, number> = {};
  const rows: LevelRow[] = [];
  let i = 0;
  for (let lv = start; lv <= end; lv++) {
    const sp = spGainedAt(lv, build.tier);
    const points: { skillId: number; to: number }[] = [];
    let unspent = 0;
    for (let k = 0; k < sp; k++) {
      if (i >= seq.length) {
        unspent++;
        continue;
      }
      const id = seq[i++];
      levels[id] = (levels[id] ?? 0) + 1;
      const last = points[points.length - 1];
      if (last && last.skillId === id) last.to = levels[id];
      else points.push({ skillId: id, to: levels[id] });
    }
    rows.push({ level: lv, sp, points, unspent });
  }
  return rows;
}
