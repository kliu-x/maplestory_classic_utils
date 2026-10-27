import type { GameMap, Item, JobId, Monster, Npc, Quest, Skill } from '../models/types';
import monstersJson from './generated/monsters.json';
import mapsJson from './generated/maps.json';
import skillsJson from './generated/skills.json';
import questsJson from './generated/quests.json';
import metaJson from './generated/meta.json';
import npcsJson from './generated/npcs.json';
import itemsJson from './generated/items.json';
import { JOBS } from './rules';

export const MONSTERS = monstersJson as unknown as Monster[];
export const MAPS = mapsJson as unknown as GameMap[];
export const SKILLS = skillsJson as unknown as Skill[];
export const QUESTS = questsJson as unknown as Quest[];
export const DATA_META = metaJson;
export const NPCS = npcsJson as Npc[];
export const ITEMS = itemsJson as Item[];

export const monsterById = new Map(MONSTERS.map((m) => [m.id, m]));
export const mapById = new Map(MAPS.map((m) => [m.id, m]));
export const skillById = new Map(SKILLS.map((s) => [s.id, s]));
export const npcById = new Map(NPCS.map((n) => [n.id, n]));
export const itemById = new Map(ITEMS.map((i) => [i.id, i]));

/** Everything a player might remember a quest by: its name, area, NPCs, monsters and items. */
export function questSearchText(q: Quest): string {
  return [
    q.name,
    q.area,
    q.npcId != null ? npcById.get(q.npcId)?.name : '',
    q.endNpcId != null ? npcById.get(q.endNpcId)?.name : '',
    ...q.killMobs.map((k) => monsterById.get(k.mobId)?.name ?? ''),
    ...q.collectItems.map((i) => itemById.get(i.itemId)?.name ?? ''),
  ]
    .join(' ')
    .toLowerCase();
}

/** Images served by maplestory.io for Classic World (loaded only when shown). */
export const IMG = {
  minimap: (mapId: number) => `https://maplestory.io/api/MCW/1/map/${mapId}/minimap`,
  npc: (id: number) => `https://maplestory.io/api/MCW/1/npc/${id}/icon`,
  mob: (id: number) => `https://maplestory.io/api/MCW/1/mob/${id}/icon`,
  item: (id: number) => `https://maplestory.io/api/MCW/1/item/${id}/icon`,
};

/** Skills usable by a job (its own and earlier tiers), hidden helper skills excluded. */
export function skillsForJob(job: JobId, includeHidden = false): Skill[] {
  const ids = new Set(JOBS[job].gameJobIds);
  return SKILLS.filter((s) => ids.has(s.jobId) && (includeHidden || !s.hidden));
}

/**
 * Skills whose damage numbers live in a different (hidden) skill entry.
 * Poison Breath (2101004) has no MAD in its own entry; hidden skill 2101005 at the same
 * level carries MAD 50-80 and mobCount 6. The link is inferred from the data and the
 * skill text ("explodes on 6 nearby targets"), so it is labelled as an inference.
 */
export const DAMAGE_LINK: Record<number, { skillId: number; note: string }> = {
  2101004: { skillId: 2101005, note: 'Damage taken from hidden skill 2101005 (inferred link: Poison Breath explosion).' },
};

/** Element of attack skills (from skill names; the skillbook JSON carries no element field). */
export const SKILL_ELEMENT: Record<number, 'fire' | 'ice' | 'lightning' | 'poison'> = {
  2101003: 'fire',
  2101004: 'poison',
  2201003: 'ice',
  2201004: 'lightning',
};

export interface AttackSkillInfo {
  skill: Skill;
  damageSkill: Skill;
  kind: 'magic' | 'physical';
}

/** A skill counts as an attack if its (linked) damage entry has MAD or damage%. */
export function attackInfo(skillId: number): AttackSkillInfo | null {
  const skill = skillById.get(skillId);
  if (!skill) return null;
  const damageSkill = skillById.get(DAMAGE_LINK[skillId]?.skillId ?? skillId) ?? skill;
  const last = damageSkill.levels[damageSkill.levels.length - 1];
  if (!last) return null;
  if (last.mad) return { skill, damageSkill, kind: 'magic' };
  if (last.damage && (last.attackCount || last.bulletCount) && skill.id !== 4001000) return { skill, damageSkill, kind: 'physical' };
  return null;
}

export function attackSkillsForJob(job: JobId): AttackSkillInfo[] {
  return skillsForJob(job)
    .map((s) => attackInfo(s.id))
    .filter((x): x is AttackSkillInfo => !!x);
}
