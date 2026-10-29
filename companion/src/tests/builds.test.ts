import { describe, expect, it } from 'vitest';
import { BUILDS } from '../data/builds';
import { skillById, skillsForJob } from '../data';
import { jobTierOfGameJob, skillJobId } from '../data/rules';
import { spPools, spGainedAt, validateAllocation } from '../calculators/sp';
import { expandBuild, finalAllocation, levelTable, nextSp } from '../calculators/planner';

describe('SP pools (rules)', () => {
  it('matches the community-reported totals', () => {
    expect(spPools(9, 0).beginner).toBe(8);
    expect(spPools(10, 1)).toMatchObject({ beginner: 9, first: 1, second: 0 });
    expect(spPools(30, 1).first).toBe(61);
    expect(spPools(35, 1)).toMatchObject({ first: 61, pendingSecond: 15 });
    expect(spPools(30, 2)).toMatchObject({ first: 61, second: 1 });
    expect(spPools(100, 2).second).toBe(211);
  });

  it('per-level gains sum to the pools', () => {
    let first = 0;
    for (let lv = 10; lv <= 30; lv++) first += spGainedAt(lv, 1);
    expect(first).toBe(spPools(30, 1).first);
    let second = 0;
    for (let lv = 30; lv <= 70; lv++) second += spGainedAt(lv, 2);
    expect(second).toBe(spPools(70, 2).second);
  });
});

describe.each(BUILDS.map((b) => [b.id, b] as const))('build %s', (_id, build) => {
  const job = build.jobs[0];
  const tierJobIds = new Set(skillsForJob(job).filter((s) => jobTierOfGameJob(s.jobId) === build.tier).map((s) => s.id));

  it('only uses skills of its own job tier', () => {
    for (const s of build.steps) {
      expect(skillById.has(s.skillId), `skill ${s.skillId} exists`).toBe(true);
      expect(tierJobIds.has(s.skillId), `skill ${s.skillId} belongs to tier ${build.tier}`).toBe(true);
    }
  });

  it('never exceeds a skill cap', () => {
    for (const s of build.steps) expect(s.to).toBeLessThanOrEqual(skillById.get(s.skillId)!.masterLevel);
  });

  it('meets every prerequisite before the first point goes in', () => {
    const alloc: Record<number, number> = {};
    for (const id of expandBuild(build)) {
      for (const p of skillById.get(id)!.prereqs) {
        if (jobTierOfGameJob(skillJobId(p.skillId)) !== build.tier) continue;
        expect(alloc[p.skillId] ?? 0, `${skillById.get(id)!.name} needs ${p.skillId} Lv ${p.level}`).toBeGreaterThanOrEqual(p.level);
      }
      alloc[id] = (alloc[id] ?? 0) + 1;
    }
  });

  it('fits in the SP pool', () => {
    const total = expandBuild(build).length;
    if (build.tier === 1) expect(total).toBe(spPools(30, 1).first); // uses every 1st-job SP, no more
    else expect(total).toBeLessThanOrEqual(spPools(100, 2).second);
  });

  it('passes full validation at the level where it completes', () => {
    const rows = levelTable(build, 100);
    const done = rows.find((r) => r.unspent > 0) ?? rows[rows.length - 1];
    const level = build.tier === 1 ? 30 : done.level;
    expect(validateAllocation(skillsForJob(job, true), finalAllocation(build), level, build.tier)).toEqual([]);
    // ...and one level earlier it would NOT fit (the table is tight, not padded).
    if (build.tier === 2) expect(validateAllocation(skillsForJob(job, true), finalAllocation(build), level - 2, 2).some((i) => i.kind === 'pool')).toBe(true);
  });

  it('level table hands out exactly the build, in order', () => {
    const rows = levelTable(build, 100);
    const spent = rows.reduce((t, r) => t + r.sp - r.unspent, 0);
    expect(spent).toBe(expandBuild(build).length);
    // Replaying the table's "raise X to N" entries reproduces the final allocation.
    const replay: Record<number, number> = {};
    for (const p of rows.flatMap((r) => r.points)) {
      expect(p.to).toBeGreaterThan(replay[p.skillId] ?? 0);
      replay[p.skillId] = p.to;
    }
    expect(replay).toEqual(finalAllocation(build));
  });
});

describe('nextSp', () => {
  const build = BUILDS.find((b) => b.id === 'mage1-claw-mp')!;
  it('starts at the beginning for a fresh character', () => {
    expect(nextSp(build, {}, 3).map((s) => [s.skillId, s.to])).toEqual([
      [2001002, 1],
      [2001003, 1],
      [2001003, 2],
    ]);
  });
  it('skips what is already learned and tolerates off-build points', () => {
    const next = nextSp(build, { 2001002: 1, 2001003: 20, 2000000: 2 }, 3);
    expect(next.map((s) => [s.skillId, s.to])).toEqual([
      [2001000, 1],
      [2001000, 2],
      [2001000, 3],
    ]);
  });
  it('returns nothing when the build is complete', () => {
    expect(nextSp(build, finalAllocation(build), 3)).toEqual([]);
  });
});

describe('validateAllocation', () => {
  const skills = skillsForJob('wizard_il');
  it('flags over-cap, missing prerequisite and pool overflow', () => {
    const issues = validateAllocation(skills, { 2001003: 25, 2201000: 1 }, 12, 2);
    const kinds = issues.map((i) => i.kind).sort();
    expect(kinds).toContain('over_cap');
    expect(kinds).toContain('prereq'); // Magic Claw without Energy Bolt, Meditation without MP Eater
    expect(kinds).toContain('pool');
  });
  it('rejects skills from another job', () => {
    expect(validateAllocation(skills, { 4001003: 1 }, 30, 2)[0].kind).toBe('unknown_skill');
  });
});

describe('skills spent off the plan', () => {
  // Energy Bolt 20, MP Recovery 3, Max MP Increase 15, Magic Guard 3: maxed Max MP instead of MP Recovery.
  const skills = { 2001002: 20, 2000000: 3, 2000001: 15, 2001000: 3 };

  it('lists points the plan never gives', async () => {
    const { buildById } = await import('../data/builds');
    const { offPlan } = await import('../calculators/planner');
    expect(offPlan(buildById.get('mage1-meow-bolt')!, skills)).toEqual([{ skillId: 2000001, have: 15, plan: 3 }]);
    expect(offPlan(buildById.get('mage1-maxmp-bolt')!, skills)).toEqual([]);
  });

  it('picks the build that matches hand-entered skills', async () => {
    const { newCharacter } = await import('../storage/store');
    const { activeBuild } = await import('../calculators/choose');
    const c = { ...newCharacter('magician'), level: 26, skills, followPlan: false };
    expect(activeBuild(c, 1)!.id).toBe('mage1-maxmp-bolt');
    // ...and the next SP go to Magic Armor, not back into MP Recovery.
    expect(nextSp(activeBuild(c, 1)!, skills, 1)[0].skillId).toBe(2001001);
    // An explicit choice still wins.
    expect(activeBuild({ ...c, buildId: 'mage1-meow-bolt' }, 1)!.id).toBe('mage1-meow-bolt');
  });

  it('rates every build, MeowDB plans highest', async () => {
    const { BUILDS } = await import('../data/builds');
    for (const b of BUILDS) expect(b.rating.why.length).toBeGreaterThan(0);
    for (const b of BUILDS.filter((x) => x.source)) expect(b.rating.stars).toBe(3);
  });
});
