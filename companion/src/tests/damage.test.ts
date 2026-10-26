import { describe, expect, it } from 'vitest';
import { castsToKill, expectedLine } from '../calculators/damage';
import { defenseFactor, hitChance, levelGapFactor, magicRange, mastery, physicalRange } from '../calculators/formulas';

describe('castsToKill', () => {
  it('is exact for fixed damage', () => {
    const k = castsToKill(100, { min: 30, avg: 30, max: 30, hitRate: 1 }, 1);
    expect(k).toMatchObject({ expected: 4, best: 4, worstNoMiss: 4, median: 4, p90: 4, deterministic: true });
  });

  it('counts multiple lines per cast (Magic Claw / Lucky Seven style)', () => {
    expect(castsToKill(100, { min: 30, avg: 30, max: 30, hitRate: 1 }, 2).expected).toBe(2);
  });

  it('kills in one cast when even min damage is enough', () => {
    const k = castsToKill(45, { min: 50, avg: 60, max: 70, hitRate: 1 }, 1);
    expect(k.expected).toBeCloseTo(1, 6);
    expect(k.best).toBe(1);
    expect(k.worstNoMiss).toBe(1);
  });

  it('gives a range between best and worst for variable damage', () => {
    const k = castsToKill(1000, { min: 100, avg: 150, max: 200, hitRate: 1 }, 1);
    expect(k.best).toBe(5);
    expect(k.worstNoMiss).toBe(10);
    expect(k.expected).toBeGreaterThan(k.best);
    expect(k.expected).toBeLessThan(k.worstNoMiss);
    // ~1000/150 = 6.67 hits needed on average -> 7 casts expected-ish
    expect(k.expected).toBeGreaterThan(6.8);
    expect(k.expected).toBeLessThan(7.6);
    expect(k.median).toBeLessThanOrEqual(k.p90);
  });

  it('roughly doubles casts at 50% hit rate', () => {
    const full = castsToKill(1000, { min: 100, avg: 150, max: 200, hitRate: 1 }, 1).expected;
    const half = castsToKill(1000, { min: 100, avg: 150, max: 200, hitRate: 0.5 }, 1).expected;
    expect(half / full).toBeGreaterThan(1.8);
    expect(half / full).toBeLessThan(2.2);
    expect(castsToKill(1000, { min: 100, avg: 150, max: 200, hitRate: 0.5 }, 1).worstNoMiss).toBe(Infinity);
  });

  it('cannot kill with zero damage or zero hit rate', () => {
    expect(castsToKill(100, { min: 0, avg: 0, max: 0, hitRate: 1 }, 1).expected).toBe(Infinity);
    expect(castsToKill(100, { min: 10, avg: 10, max: 10, hitRate: 0 }, 1).expected).toBe(Infinity);
  });

  it('cumulative kill probability is non-decreasing and reaches ~1', () => {
    const { cumulative } = castsToKill(500, { min: 20, avg: 50, max: 90, hitRate: 0.9 }, 2);
    for (let i = 1; i < cumulative.length; i++) expect(cumulative[i]).toBeGreaterThanOrEqual(cumulative[i - 1] - 1e-12);
    expect(cumulative[cumulative.length - 1]).toBeGreaterThan(0.999);
  });

  it('matches the geometric distribution for one-shot kills with misses', () => {
    // Every hit kills; each cast has 1 line hitting 10% of the time -> E[casts] = 10.
    const k = castsToKill(100, { min: 150, avg: 175, max: 200, hitRate: 0.1 }, 1);
    expect(k.expected).toBeCloseTo(10, 1);
    expect(k.median).toBe(7); // 1 - 0.9^7 = 0.52
    // Two lines per cast: P(at least one hit) = 0.19 -> E = 1/0.19
    expect(castsToKill(100, { min: 150, avg: 175, max: 200, hitRate: 0.1 }, 2).expected).toBeCloseTo(1 / 0.19, 1);
  });

  it('stays fast for low hit rates and many casts', () => {
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) castsToKill(5000 + i, { min: 40, avg: 60, max: 90, hitRate: 0.05 }, 2);
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  it('approximates hopeless matchups instead of looping', () => {
    const k = castsToKill(66640, { min: 1, avg: 2, max: 3, hitRate: 0.5 }, 1);
    expect(k.approximate).toBe(true);
    expect(k.expected).toBeGreaterThan(60000);
  });

  it('expectedLine includes misses', () => {
    expect(expectedLine({ min: 10, avg: 20, max: 30, hitRate: 0.5 })).toBe(10);
  });
});

describe('community formulas', () => {
  it('mastery matches the guide (Lv 0 -> 0.07, Lv 10 -> 0.77)', () => {
    expect(mastery(0)).toBeCloseTo(0.07);
    expect(mastery(10)).toBeCloseTo(0.77);
  });

  it('magic max = S x (floor(INT/2)+MATK) x (1 + INT/125)', () => {
    const r = magicRange({ skillPower: 65, totalInt: 100, matk: 30, spellMastery: 10 });
    expect(r.max).toBeCloseTo(0.65 * 80 * 1.8);
    expect(r.min).toBeCloseTo(0.65 * 80 * (1 + (100 * 0.77) / 125));
    expect(r.min).toBeLessThan(r.max);
  });

  it('physical range with Lucky Seven multipliers', () => {
    const r = physicalRange({ skillPercent: 140, totalWatk: 30, primary: 100, secondary: 50, weaponMult: 3, masteryOverride: 0.5 });
    expect(r.max).toBeCloseTo(1.4 * 30 * (1 + 350 / 100));
    expect(r.min).toBeCloseTo(1.4 * 30 * (0.8 + 200 / 100));
    expect(r.avg).toBeGreaterThan(r.min);
    expect(r.avg).toBeLessThan(r.max);
  });

  it('defense, level gap and hit chance behave at their edges', () => {
    expect(defenseFactor(0)).toBe(1);
    expect(defenseFactor(100)).toBe(0.5);
    expect(levelGapFactor(10, 20)).toBe(1);
    expect(levelGapFactor(25, 20)).toBeCloseTo(1 / 1.125);
    expect(levelGapFactor(40, 20)).toBeCloseTo(1 / 2);
    expect(hitChance({ totalAcc: 200, mobEva: 0, mobLevel: 10, playerLevel: 10 })).toBe(1);
    expect(hitChance({ totalAcc: 1, mobEva: 100, mobLevel: 50, playerLevel: 10 })).toBe(0);
    const mid = hitChance({ totalAcc: 60, mobEva: 25, mobLevel: 30, playerLevel: 30 });
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThanOrEqual(1);
  });
});
