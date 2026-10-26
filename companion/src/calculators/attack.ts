// Resolve "how hard does this character hit this monster with this skill", in order of trust:
//   1. measured  - a damage observation recorded on this exact monster
//   2. projected - an observation on another monster, rescaled by defense/level/element models
//   3. estimated - community damage formula from the character's stats
// The provenance and every adjustment are returned as notes for the UI.

import type { Character, DamageObservation, Monster, TrainingAssumptions } from '../models/types';
import { DAMAGE_LINK, SKILL_ELEMENT, attackInfo, monsterById, skillById } from '../data';
import { JOBS } from '../data/rules';
import { ELEMENT_MULT, defenseFactor, derivedAccuracy, hitChance, levelGapFactor, magicRange, physicalRange } from './formulas';
import type { LineDamage } from './damage';
import type { ResolvedAttack } from './training';

const CLAW_MASTERY = 4100000;
const CRITICAL_THROW = 4100001;
const NIMBLE_BODY = 4000000;
const LUCKY_SEVEN = 4001003;
const DOUBLE_STAB = 4001002;

const total = (c: Character, k: 'str' | 'dex' | 'int' | 'luk') => c.base[k] + c.equip[k];

export function totalAccuracy(c: Character): number {
  const job = JOBS[c.job];
  const stats = { str: total(c, 'str'), dex: total(c, 'dex'), int: total(c, 'int'), luk: total(c, 'luk') };
  let acc = derivedAccuracy(job.family, c.level, stats);
  const nb = c.skills[NIMBLE_BODY] ?? 0;
  if (nb > 0) acc += Number(skillById.get(NIMBLE_BODY)?.levels[nb - 1]?.raw.accX ?? 0);
  return acc;
}

/** Multiplier applied to raw damage against `mob` (1 when every adjustment is off). */
export function targetFactor(c: Character, skillId: number | null, mob: Monster | null, a: TrainingAssumptions, notes?: string[]) {
  if (!mob) return 1;
  const info = skillId != null ? attackInfo(skillId) : null;
  const magic = info?.kind === 'magic' || (!info && JOBS[c.job].damageType === 'magic');
  let f = 1;
  if (a.adjustForDefense) {
    const def = magic ? mob.mdd : mob.pdd;
    const d = defenseFactor(def);
    f *= d;
    if (notes && def > 0) notes.push(`${magic ? 'Magic' : 'Weapon'} DEF ${def}: x${d.toFixed(2)} (community formula)`);
  }
  if (a.adjustForLevelGap) {
    const g = levelGapFactor(mob.level, c.level);
    f *= g;
    if (notes && g < 1) notes.push(`Level gap +${mob.level - c.level}: x${g.toFixed(2)} (community formula)`);
  }
  const el = skillId != null ? SKILL_ELEMENT[skillId] : undefined;
  if (a.adjustForElement && el && mob.elements[el]) {
    const m = ELEMENT_MULT[a.elementModel][mob.elements[el]!];
    f *= m;
    if (notes) notes.push(`${mob.elements[el]} to ${el}: x${m} (CONFLICTING sources, ${a.elementModel} model)`);
  }
  return f;
}

export function estimatedHitRate(c: Character, mob: Monster): number {
  return hitChance({ totalAcc: totalAccuracy(c), mobEva: mob.evasion, mobLevel: mob.level, playerLevel: c.level });
}

function pickObservation(c: Character, skillId: number | null, mobId: number): { obs: DamageObservation; exact: boolean } | null {
  const forSkill = c.observations.filter((o) => o.skillId === skillId && o.avg > 0);
  if (!forSkill.length) return null;
  const latest = (xs: DamageObservation[]) => [...xs].sort((x, y) => y.recordedAt.localeCompare(x.recordedAt))[0];
  const exact = forSkill.filter((o) => o.mobId === mobId);
  if (exact.length) return { obs: latest(exact), exact: true };
  return { obs: latest(forSkill), exact: false };
}

function scale(l: LineDamage, f: number): LineDamage {
  return { min: l.min * f, avg: l.avg * f, max: l.max * f, hitRate: l.hitRate };
}

export function formulaEstimate(c: Character, skillId: number): { line: LineDamage; notes: string[] } | null {
  const info = attackInfo(skillId);
  if (!info) return null;
  const notes: string[] = ['Formula estimate (community formula, not verified for Classic World).'];
  let lv = c.skills[skillId] ?? 0;
  if (lv <= 0) {
    lv = 1;
    notes.push(`${info.skill.name} not learned; estimating at Lv 1.`);
  }
  const d = info.damageSkill.levels[Math.min(lv, info.damageSkill.levels.length) - 1];
  if (info.kind === 'magic') {
    const r = magicRange({ skillPower: d.mad ?? 0, totalInt: total(c, 'int'), matk: c.magicAttack, spellMastery: Number(d.raw.mastery ?? 0) });
    return { line: { ...r, hitRate: 1 }, notes };
  }
  const luk = total(c, 'luk');
  const secondary = total(c, 'str') + total(c, 'dex');
  const cm = c.skills[CLAW_MASTERY] ?? 0;
  const cmData = cm > 0 ? skillById.get(CLAW_MASTERY)?.levels[cm - 1] : undefined;
  const watk = c.weaponAttack + c.starAttack + Number(cmData?.raw.x ?? 0);
  let r;
  if (skillId === LUCKY_SEVEN) {
    r = physicalRange({ skillPercent: d.damage ?? 100, totalWatk: watk, primary: luk, secondary, weaponMult: 3.0, masteryOverride: 0.5 });
  } else if (skillId === DOUBLE_STAB) {
    r = physicalRange({ skillPercent: d.damage ?? 100, totalWatk: c.weaponAttack, primary: luk, secondary, weaponMult: 2.0, masteryLevel: 0 });
    notes.push('Double Stab estimated as a dagger stab (weapon multiplier 2.0).');
  } else {
    r = physicalRange({ skillPercent: d.damage ?? 100, totalWatk: watk, primary: luk, secondary, weaponMult: 2.5, masteryLevel: Number(cmData?.raw.mastery ?? 0) });
  }
  // Expected critical bonus (base 5% / +20%, plus Critical Throw).
  const ct = c.skills[CRITICAL_THROW] ?? 0;
  const ctData = ct > 0 ? skillById.get(CRITICAL_THROW)?.levels[ct - 1] : undefined;
  const crit = 0.05 + Number(ctData?.raw.crtX ?? 0) / 100;
  const critDmg = 0.2 + Number(ctData?.raw.crdX ?? 0) / 100;
  notes.push(`Includes expected crits (${Math.round(crit * 100)}% for +${Math.round(critDmg * 100)}%).`);
  return { line: { min: r.min, avg: r.avg * (1 + crit * critDmg), max: r.max * (1 + critDmg), hitRate: 1 }, notes };
}

export function resolveAttack(c: Character, skillId: number | null, mob: Monster, a: TrainingAssumptions): ResolvedAttack {
  const info = skillId != null ? attackInfo(skillId) : null;
  if (!info || skillId == null) {
    return { line: { min: 0, avg: 0, max: 0, hitRate: 0 }, linesPerCast: 1, maxTargets: 1, mpPerCast: 0, starsPerCast: 0, provenance: 'none', notes: ['Pick an attack skill.'] };
  }
  const lv = Math.max(1, c.skills[skillId] ?? 0);
  const d = info.damageSkill.levels[Math.min(lv, info.damageSkill.levels.length) - 1];
  const own = info.skill.levels[Math.min(lv, info.skill.levels.length) - 1];
  const physicalStars = info.kind === 'physical' && skillId !== DOUBLE_STAB;
  const base = {
    linesPerCast: (d.attackCount ?? 1) * (physicalStars ? d.bulletCount ?? 1 : 1),
    maxTargets: d.mobCount ?? 1,
    mpPerCast: own?.mpCon ?? d.mpCon ?? 0,
    starsPerCast: physicalStars ? d.bulletCount ?? 1 : 0,
  };
  const notes: string[] = [];
  if (DAMAGE_LINK[skillId]) notes.push(DAMAGE_LINK[skillId].note);

  const picked = pickObservation(c, skillId, mob.id);
  if (picked?.exact) {
    const o = picked.obs;
    notes.unshift('Measured on this monster.');
    return { ...base, line: { min: o.min, avg: o.avg, max: o.max, hitRate: o.hitRate }, provenance: 'measured', notes };
  }

  const tNotes: string[] = [];
  const toTarget = targetFactor(c, skillId, mob, a, tNotes);
  let line: LineDamage;
  let provenance: ResolvedAttack['provenance'];
  if (picked) {
    const o = picked.obs;
    const from = o.mobId != null ? monsterById.get(o.mobId) ?? null : null;
    const fromF = targetFactor(c, skillId, from, a);
    line = scale({ min: o.min, avg: o.avg, max: o.max, hitRate: o.hitRate }, toTarget / (fromF || 1));
    provenance = 'projected';
    notes.unshift(`Projected from damage measured on ${from ? from.name : 'an unspecified monster (treated as 0 DEF, no level gap)'}.`);
  } else {
    const est = formulaEstimate(c, skillId);
    if (!est) return { ...base, line: { min: 0, avg: 0, max: 0, hitRate: 0 }, provenance: 'none', notes: ['No damage data.'] };
    line = scale(est.line, toTarget);
    provenance = 'estimated';
    notes.unshift(...est.notes);
  }
  notes.push(...tNotes);
  if (a.adjustForAccuracy) {
    line.hitRate = estimatedHitRate(c, mob);
    if (line.hitRate < 1) notes.push(`Estimated hit rate ${(line.hitRate * 100).toFixed(0)}% (community accuracy formula).`);
  }
  return { ...base, line, provenance, notes };
}
