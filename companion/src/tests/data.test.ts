import { describe, expect, it } from 'vitest';
import { MAPS, MONSTERS, QUESTS, SKILLS, attackInfo, monsterById, skillById } from '../data';
import type { SourceMeta } from '../models/types';

const STATUSES = ['verified', 'community_reported', 'unverified', 'conflicting'];
const hasSource = (s: SourceMeta) =>
  !!s && typeof s.source_url === 'string' && s.source_url.startsWith('https://') && !!s.source_title && /^\d{4}-\d{2}-\d{2}/.test(s.retrieved_at) && STATUSES.includes(s.verification_status);

describe('generated dataset', () => {
  it('every record carries source metadata', () => {
    for (const r of [...MONSTERS, ...MAPS, ...SKILLS, ...QUESTS]) expect(hasSource(r.source), `record ${r.id}`).toBe(true);
  });

  it('is Classic World data, not pre-Big-Bang (Snail: 45 HP / 2 EXP, id 2)', () => {
    expect(monsterById.get(2)).toMatchObject({ name: 'Snail', level: 1, hp: 45, exp: 2 });
    expect(monsterById.has(100100)).toBe(false); // legacy GMS Snail id
  });

  it('spot-checks monster values from the MCW files', () => {
    expect(monsterById.get(24)).toMatchObject({ name: 'Iron Hog', level: 28, hp: 572, exp: 52, pdd: 500, mdd: 100, elemRaw: 'L3' });
    expect(monsterById.get(24)!.elements).toEqual({ lightning: 'weak' });
    expect(monsterById.get(21)).toMatchObject({ name: 'Zombie Mushroom', undead: true });
    expect(monsterById.get(2)!.spawns.length).toBeGreaterThan(0);
  });

  it('spot-checks skill data (caps, hits, targets)', () => {
    expect(skillById.get(2001003)).toMatchObject({ name: 'Magic Claw', masterLevel: 20 });
    expect(skillById.get(2001003)!.levels[19]).toMatchObject({ mad: 65, attackCount: 2, mobCount: 1 });
    expect(skillById.get(2001003)!.prereqs).toEqual([{ skillId: 2001002, level: 1 }]);
    expect(skillById.get(4001003)!.levels[19]).toMatchObject({ damage: 140, bulletCount: 2, attackCount: 1 });
    expect(skillById.get(2201004)!.levels[29]).toMatchObject({ mad: 70, mobCount: 6 });
    expect(attackInfo(2101004)!.damageSkill.id).toBe(2101005); // Poison Breath -> hidden explosion entry
  });

  it('skill levels are complete up to the master level', () => {
    for (const s of SKILLS) expect(s.levels.length, s.name).toBe(s.masterLevel);
  });
});
