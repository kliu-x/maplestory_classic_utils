// Picks the SP build and attack skill a character's advice is based on. No UI imports,
// so it can be unit-tested.

import type { Character } from '../models/types';
import { buildById, buildsFor, type Build } from '../data/builds';
import { attackSkillsForJob } from '../data';
import { JOBS } from '../data/rules';
import { spPools } from './sp';
import { expandBuild } from './planner';
import { expectedBase } from './ap';

export function activeBuild(c: Character, tier: 1 | 2): Build | null {
  const chosen = c.buildId ? buildById.get(c.buildId) : undefined;
  if (chosen && chosen.tier === tier && chosen.jobs.includes(c.job)) return chosen;
  // A 2nd-job character may still have unspent 1st-job SP; pick per tier.
  // Default to the build that maxes the attack this character actually uses.
  const builds = buildsFor(c.job, tier);
  const attack = defaultAttackSkill(c);
  return builds.find((b) => b.steps.some((s) => s.skillId === attack && s.to >= 20)) ?? builds[0] ?? null;
}

export function defaultAttackSkill(c: Character): number | null {
  const skills = attackSkillsForJob(c.job);
  if (c.mainSkillId && skills.some((s) => s.skill.id === c.mainSkillId)) return c.mainSkillId;
  // Highest-level learned attack, else the attack the job's first build maxes, else the first one.
  const learned = skills.filter((s) => (c.skills[s.skill.id] ?? 0) > 0).sort((a, b) => (c.skills[b.skill.id] ?? 0) - (c.skills[a.skill.id] ?? 0));
  if (learned[0]) return learned[0].skill.id;
  const first = buildsFor(c.job, 1)[0];
  const planned = skills.find((s) => first?.steps.some((st) => st.skillId === s.skill.id && st.to >= 20));
  return (planned ?? skills[0])?.skill.id ?? null;
}

/** Skill levels a character has at its level if every SP went into its build(s), in order. */
export function planSkills(c: Character): Record<number, number> {
  const tier = JOBS[c.job].tier;
  if (tier === 0) return {};
  const pools = spPools(c.level, tier);
  const out: Record<number, number> = {};
  for (const t of tier === 2 ? ([1, 2] as const) : ([1] as const)) {
    const build = activeBuild(c, t);
    if (!build) continue;
    for (const id of expandBuild(build).slice(0, t === 1 ? pools.first : pools.second)) out[id] = (out[id] ?? 0) + 1;
  }
  return out;
}

/** With followPlan on, skills and base stats are whatever the plan gives at this level. */
export function applyPlan(c: Character): Character {
  if (!c.followPlan) return c;
  return { ...c, skills: planSkills(c), base: expectedBase(c.job, c.level) };
}
