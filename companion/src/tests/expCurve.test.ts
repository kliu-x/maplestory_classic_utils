import { describe, expect, it } from 'vitest';
import { cumulativeExp, expCurve, levelAtShare, MAX_LEVEL, shareOfJourney } from '../calculators/expCurve';
import { expForLevel } from '../data/expTable';

describe('EXP curve', () => {
  it('has one point per level, marginal from the table', () => {
    const c = expCurve();
    expect(c).toHaveLength(MAX_LEVEL);
    expect(c[0]).toEqual({ level: 1, marginal: 15, cumulative: 0, increase: null });
    expect(c[1]).toEqual({ level: 2, marginal: 34, cumulative: 15, increase: 19 });
    expect(c[MAX_LEVEL - 1].marginal).toBe(0);
  });

  it('cumulative is the running sum of marginal', () => {
    const c = expCurve();
    for (let i = 1; i < c.length; i++) expect(c[i].cumulative).toBe(c[i - 1].cumulative + c[i - 1].marginal);
    expect(cumulativeExp(3)).toBe(15 + 34);
    expect(cumulativeExp(36)).toBe(c[35].cumulative);
    expect(cumulativeExp(MAX_LEVEL)).toBe(c[MAX_LEVEL - 1].cumulative);
  });

  it('increase is the change in EXP-to-next from the level before', () => {
    const c = expCurve();
    expect(c[MAX_LEVEL - 1].increase).toBeNull();
    for (let i = 1; i < MAX_LEVEL - 1; i++) {
      expect(c[i].increase).toBe(c[i].marginal - c[i - 1].marginal);
      expect(c[i].increase).toBeGreaterThan(0); // the table only ever goes up
    }
  });

  it('share of the journey counts current EXP and stays in 0..1', () => {
    expect(shareOfJourney(1)).toBe(0);
    expect(shareOfJourney(MAX_LEVEL)).toBe(1);
    const half = shareOfJourney(36, expForLevel(36) / 2);
    expect(half).toBeGreaterThan(shareOfJourney(36));
    expect(half).toBeLessThan(shareOfJourney(37));
  });

  it('levelAtShare finds the first level past a share', () => {
    const l = levelAtShare(0.5);
    expect(shareOfJourney(l)).toBeGreaterThanOrEqual(0.5);
    expect(shareOfJourney(l - 1)).toBeLessThan(0.5);
  });
});
