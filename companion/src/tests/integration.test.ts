import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseNameResults, NAME_STATUSES } from '../integrations/nameChecker';
import { migrate, newCharacter, DEFAULT_ASSUMPTIONS, exportJson, importJson, getState, encodeCharacter, decodeCharacter } from '../storage/store';
import { resolveAttack } from '../calculators/attack';
import { monsterById } from '../data';
import { rankMaps, isPqVariant, bestOnMap, laneLabel } from '../calculators/rank';
import { MAPS } from '../data';
import { expForLevel, expRemaining } from '../data/expTable';
import { expectedBase, startingStats, unspentAp } from '../calculators/ap';
import { activeBuild, applyPlan } from '../calculators/choose';
import { JOBS } from '../data/rules';
import { buildsFor } from '../data/builds';
import { attackSkillsForJob } from '../data';
import type { JobId } from '../models/types';

describe('name checker adapter', () => {
  it('never offers an "available" label for automated statuses', () => {
    for (const [status, meta] of Object.entries(NAME_STATUSES)) {
      if (status.startsWith('confirmed_')) continue;
      expect(meta.label.toLowerCase()).not.toMatch(/(^|[^n])available/);
    }
    expect(NAME_STATUSES.not_found_in_source.label).toMatch(/unconfirmed/);
  });

  it('rejects unknown statuses', () => {
    expect(() => parseNameResults(JSON.stringify({ results: [{ pokemon_name: 'Pikachu', lookup_status: 'available' }] }))).toThrow(/unknown lookup_status/);
  });

  const real = resolve(__dirname, '../../../pokemon_name_checker/output/results.json');
  it.skipIf(!existsSync(real))('parses the real results.json from Project 1', () => {
    const r = parseNameResults(readFileSync(real, 'utf8'));
    expect(r.rows.length).toBeGreaterThanOrEqual(39);
    expect(r.rows.every((x) => x.world === 'windia')).toBe(true);
  });
});

describe('storage', () => {
  it('migrate fills defaults for old/partial data and drops junk', () => {
    const s = migrate({ characters: [{ id: 'a', name: 'Old', job: 'thief', level: 12 }, null, 5], settings: { assumptions: { uptime: 0.5 } } });
    expect(s.characters).toHaveLength(1);
    expect(s.characters[0].observations).toEqual([]);
    expect(s.characters[0].base.luk).toBeGreaterThan(0);
    expect(s.settings.assumptions.uptime).toBe(0.5);
    expect(s.settings.assumptions.respawnSeconds).toBe(DEFAULT_ASSUMPTIONS.respawnSeconds);
    expect(s.settings.activeCharacterId).toBe('a');
  });

  it('export -> import round-trips', () => {
    const c = newCharacter('assassin', 'Round');
    importJson(JSON.stringify({ characters: [c], settings: { activeCharacterId: c.id } }));
    const text = exportJson();
    importJson(text);
    expect(getState().characters[0]).toMatchObject({ name: 'Round', job: 'assassin' });
    expect(() => importJson('{"hello":1}')).toThrow();
  });
});

describe('attack resolution', () => {
  const mage = { ...newCharacter('magician', 'M'), level: 22, base: { str: 4, dex: 4, int: 117, luk: 5 }, magicAttack: 25, skills: { 2001002: 1, 2001003: 20 } };
  const a = { ...DEFAULT_ASSUMPTIONS, adjustForAccuracy: false };
  const necki = monsterById.get(18)!; // Jr. Necki, M.DEF 30
  const hog = monsterById.get(24)!; // Iron Hog, M.DEF 100

  it('uses the formula estimate when nothing is measured', () => {
    const r = resolveAttack(mage, 2001003, necki, a);
    expect(r.provenance).toBe('estimated');
    expect(r.linesPerCast).toBe(2);
    expect(r.mpPerCast).toBe(20);
  });

  it('uses a measurement as-is on the same monster and projects it elsewhere by defense', () => {
    const obs = { id: 'o', skillId: 2001003, mobId: 18, min: 70, avg: 85, max: 100, hitRate: 1, note: '', recordedAt: '2026-10-26T00:00:00Z' };
    const c = { ...mage, observations: [obs] };
    const same = resolveAttack(c, 2001003, necki, a);
    expect(same.provenance).toBe('measured');
    expect(same.line.avg).toBe(85);
    const other = resolveAttack(c, 2001003, hog, { ...a, adjustForLevelGap: false });
    expect(other.provenance).toBe('projected');
    // raw = 85 * 130/100; on Iron Hog (M.DEF 100): raw * 100/200
    expect(other.line.avg).toBeCloseTo(85 * 1.3 * 0.5, 6);
  });

  it('ranks real maps and never suggests party-quest stage maps', () => {
    const rows = rankMaps({ ...mage, observations: [] }, 2001003, a);
    expect(rows.length).toBeGreaterThan(5);
    for (const r of rows) expect(r.spawns.some((s) => !isPqVariant(s.mobId))).toBe(true);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].result.netExpPerMin).toBeGreaterThanOrEqual(rows[i].result.netExpPerMin);
  });
});

describe('profile defaults (EXP, stats, build)', () => {
  it('EXP table: remaining = level requirement - current EXP', () => {
    expect(expForLevel(1)).toBe(15);
    expect(expForLevel(26)).toBe(54900);
    expect(expForLevel(100)).toBe(0);
    expect(expRemaining(26, 20000)).toBe(34900);
    expect(expRemaining(26, 999999)).toBe(0);
  });

  it('expected base stats: 12/5/4/4 start plus 5 AP per level into the main stat', () => {
    expect(startingStats('magician')).toEqual({ str: 4, dex: 4, int: 12, luk: 5 });
    expect(expectedBase('magician', 26)).toEqual({ str: 4, dex: 4, int: 137, luk: 5 });
    expect(expectedBase('thief', 10)).toEqual({ str: 4, dex: 5, int: 4, luk: 57 });
    expect(unspentAp(26, expectedBase('magician', 26))).toBe(0);
  });

  it('default SP build follows the attack the character levels', () => {
    const bolt = { ...newCharacter('magician', 'B'), level: 26, skills: { 2001002: 15, 2001003: 0 } };
    expect(activeBuild(bolt, 1)?.id).toBe('mage1-meow-bolt');
    const claw = { ...bolt, skills: { 2001002: 1, 2001003: 12 } };
    expect(activeBuild(claw, 1)?.id).toBe('mage1-meow-claw');
  });

  it('for every job, choosing a main attack picks a build that maxes it when one exists', () => {
    for (const job of Object.keys(JOBS) as JobId[]) {
      const tiers = JOBS[job].tier === 2 ? [1, 2] as const : JOBS[job].tier === 1 ? [1] as const : [];
      for (const { skill } of attackSkillsForJob(job)) {
        const c = { ...newCharacter(job, 'X'), level: 40, mainSkillId: skill.id };
        for (const t of tiers) {
          const maxing = buildsFor(job, t).filter((b) => b.steps.some((s) => s.skillId === skill.id && s.to >= 20));
          if (maxing.length) expect(maxing).toContain(activeBuild(c, t));
        }
      }
    }
  });

  it('migrate converts old "EXP to next level" and drops the old pre-set Magic Claw main skill', () => {
    const s = migrate({ characters: [{ id: 'k', name: 'Kayloo', job: 'magician', level: 26, expToNext: 4900, mainSkillId: 2001003, skills: { 2001002: 20, 2001003: 1 } }] });
    expect(s.characters[0].currentExp).toBe(50000);
    expect(s.characters[0].mainSkillId).toBeNull();
    expect('expToNext' in s.characters[0]).toBe(false);
  });
});

describe('lanes', () => {
  it('prefers an Octopus lane over roaming a map full of Stumps and Snails', () => {
    const map = MAPS.find((m) => m.name === 'Kerning City Construction Site')!;
    const thief = { ...newCharacter('thief', 'T'), level: 18, mainSkillId: 4001003 };
    const a = { ...DEFAULT_ASSUMPTIONS, adjustForAccuracy: false };
    const best = bestOnMap(thief, 4001003, map, a);
    expect(best.lane).toBeDefined();
    expect(best.spawns.map((s) => s.name)).toContain('Octopus');
    expect(best.spawns.map((s) => s.name)).not.toContain('Stump');
    expect(best.result.netExpPerMin).toBeGreaterThan(best.wholeMap!.netExpPerMin);
    expect(laneLabel(best)).toMatch(/^Lane \d+ of \d+ from the top/);
    expect(bestOnMap(thief, 4001003, map, { ...a, useLanes: false }).lane).toBeUndefined();
  });
});

describe('follow the plan', () => {
  it('fills skills and stats from the level, and keeps them in step on level-up', () => {
    const c = { ...newCharacter('magician', 'P'), level: 26, mainSkillId: 2001002 };
    const p = applyPlan(c);
    // Lv 26: 1 + 3 x 16 = 49 SP, Energy Bolt build: EB 20, then Magic Guard
    expect(p.skills[2001002]).toBe(20);
    expect(Object.values(p.skills).reduce((t, n) => t + n, 0)).toBe(49);
    expect(p.base).toEqual(expectedBase('magician', 26));
    const up = applyPlan({ ...p, level: 27 });
    expect(Object.values(up.skills).reduce((t, n) => t + n, 0)).toBe(52);
    expect(applyPlan({ ...p, followPlan: false, level: 40 }).skills).toEqual(p.skills);
    // A new Thief with nothing learned follows the first Thief build (Lucky Seven), not Double Stab.
    expect(applyPlan({ ...newCharacter('thief', 'T'), level: 20 }).skills[4001003]).toBe(20);
  });

  it('a share link round-trips a character', () => {
    const c = { ...newCharacter('thief', 'Suzukii ★'), level: 33, observations: [] };
    const back = decodeCharacter(encodeCharacter(c));
    expect(back).toMatchObject({ id: c.id, name: 'Suzukii ★', level: 33, job: 'thief' });
    expect(() => decodeCharacter('not-a-real-code')).toThrow();
  });
});
