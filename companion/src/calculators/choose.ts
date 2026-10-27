// Picks the SP build and attack skill a character's advice is based on. No UI imports,
// so it can be unit-tested.

import type { Character } from '../models/types';
import { buildById, buildsFor, type Build } from '../data/builds';
import { attackSkillsForJob } from '../data';

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
  // Highest-level learned attack, else the first one.
  const learned = skills.filter((s) => (c.skills[s.skill.id] ?? 0) > 0).sort((a, b) => (c.skills[b.skill.id] ?? 0) - (c.skills[a.skill.id] ?? 0));
  return (learned[0] ?? skills[0])?.skill.id ?? null;
}
