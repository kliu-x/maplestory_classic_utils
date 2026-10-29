import { describe, expect, it } from 'vitest';
import { GEAR_PICKS, GEAR_SOURCES, checkpointOf, gearFamily, picksAt } from '../data/gearGuide';

describe('gear by level', () => {
  it('every pick links to a known Classic World source', () => {
    expect(GEAR_PICKS.length).toBeGreaterThan(50);
    for (const p of GEAR_PICKS) {
      expect(p.sourceIds.length).toBeGreaterThan(0);
      for (const id of p.sourceIds) expect(GEAR_SOURCES[id]?.source_url).toMatch(/^https:\/\//);
    }
    for (const s of Object.values(GEAR_SOURCES)) expect(s.retrieved_at).toBe('2026-10-28');
  });

  it('folds odd levels into checkpoints', () => {
    expect(checkpointOf(26)).toBe(25);
    expect(checkpointOf(17)).toBe(15);
    expect(checkpointOf(5)).toBe(10);
  });

  it('gives a magician weapon picks at 25 and 30, best first', () => {
    expect(gearFamily('wizard_il')).toBe('magician');
    for (const lv of [25, 30]) {
      const weapon = picksAt('magician', null, lv).find((s) => s.slot === 'weapon')!;
      expect(weapon.picks[0].tier).toBe('bis');
    }
  });

  it('filters by weapon branch', () => {
    const claw = picksAt('thief', 'claw', 25).flatMap((s) => s.picks);
    expect(claw.some((p) => p.branch === 'dagger')).toBe(false);
  });
});
