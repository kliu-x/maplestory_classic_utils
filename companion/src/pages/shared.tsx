import type { Character, TrainingAssumptions } from '../models/types';
import { buildById, buildsFor, type Build } from '../data/builds';
import { JOBS, RULES } from '../data/rules';
import { attackSkillsForJob, skillsForJob } from '../data';
import { nextSp, type SpSuggestion } from '../calculators/planner';
import { spPools, spentByTier, validateAllocation, type AllocationIssue } from '../calculators/sp';
import { suggestAp, unspentAp, type ApSuggestion } from '../calculators/ap';
import { rankMaps, type MapRow } from '../calculators/rank';
import { useAppState } from '../storage/store';
import { href } from '../router';

export type PageProps = { params: URLSearchParams };

export function useActive(): { character: Character | null; assumptions: TrainingAssumptions } {
  const s = useAppState();
  return { character: s.characters.find((c) => c.id === s.settings.activeCharacterId) ?? null, assumptions: s.settings.assumptions };
}

export function NeedCharacter() {
  return (
    <div className="card empty">
      <h2>No character yet</h2>
      <p>Create a character profile to get personalised training, SP and AP advice.</p>
      <a className="btn primary" href={href('characters', { new: 1 })}>
        + Create character
      </a>
    </div>
  );
}

/** The tier whose SP the character is currently spending (1st job until 2nd advancement). */
export function spendingTier(c: Character): 1 | 2 | null {
  const t = JOBS[c.job].tier;
  if (t === 0) return null;
  return t === 2 ? 2 : 1;
}

export function activeBuild(c: Character, tier: 1 | 2): Build | null {
  const chosen = c.buildId ? buildById.get(c.buildId) : undefined;
  if (chosen && chosen.tier === tier && chosen.jobs.includes(c.job)) return chosen;
  // A 2nd-job character may still have unspent 1st-job SP; pick per tier.
  return buildsFor(c.job, tier)[0] ?? null;
}

export function defaultAttackSkill(c: Character): number | null {
  const skills = attackSkillsForJob(c.job);
  if (c.mainSkillId && skills.some((s) => s.skill.id === c.mainSkillId)) return c.mainSkillId;
  // Highest-level learned attack, else the first one.
  const learned = skills.filter((s) => (c.skills[s.skill.id] ?? 0) > 0).sort((a, b) => (c.skills[b.skill.id] ?? 0) - (c.skills[a.skill.id] ?? 0));
  return (learned[0] ?? skills[0])?.skill.id ?? null;
}

export interface Advice {
  sp: { tier: 1 | 2; build: Build | null; next: SpSuggestion[]; available: number; spent: number }[];
  ap: ApSuggestion[];
  unspentAp: number;
  issues: AllocationIssue[];
  topMaps: MapRow[];
  skillId: number | null;
  warnings: string[];
}

export function adviceFor(c: Character, a: TrainingAssumptions): Advice {
  const job = JOBS[c.job];
  const tier = job.tier;
  const warnings: string[] = [];
  const pools = spPools(c.level, tier);
  const spent = spentByTier(c.skills);
  const sp: Advice['sp'] = [];
  if (tier >= 1) {
    const tiers: (1 | 2)[] = tier === 2 ? [1, 2] : [1];
    for (const t of tiers) {
      const available = t === 1 ? pools.first : pools.second;
      const used = t === 1 ? spent.first : spent.second;
      const build = activeBuild(c, t);
      const free = Math.max(0, available - used);
      if (t === 1 && tier === 2 && free === 0) continue;
      sp.push({ tier: t, build, next: build ? nextSp(build, c.skills, 3) : [], available, spent: used });
    }
  }
  if (pools.pendingSecond > 0) warnings.push(`You have ${pools.pendingSecond} SP waiting for 2nd job (Lv ${RULES.secondJobLevel.value}+).`);
  if (c.level >= RULES.secondJobLevel.value && tier === 1 && job.family !== 'Beginner') warnings.push('You can make your 2nd job advancement.');
  if (c.level >= RULES.firstJobLevel.value && tier === 0) warnings.push('You can make your 1st job advancement.');

  const issues = tier > 0 ? validateAllocation(skillsForJob(c.job, true), c.skills, c.level, tier) : [];
  const unspent = unspentAp(c.level, c.base);
  if (unspent < 0) warnings.push(`Base stats add up to ${-unspent} more than expected for Lv ${c.level} (check base vs equipment split).`);

  const skillId = defaultAttackSkill(c);
  const topMaps = skillId ? rankMaps(c, skillId, a).slice(0, 3) : [];
  if (!c.observations.length) warnings.push('No measured damage yet: training numbers use formula estimates. Record a few hits on the Characters page.');

  return { sp, ap: job.tier >= 0 ? suggestAp(job, c.base, c.equip, c.statGoals ?? {}) : [], unspentAp: unspent, issues, topMaps, skillId, warnings };
}
