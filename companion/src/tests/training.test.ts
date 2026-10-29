import { describe, expect, it } from 'vitest';
import { evaluateMap, evaluateMonster, type ResolvedAttack, type SpawnInput } from '../calculators/training';
import { DEFAULT_ASSUMPTIONS } from '../storage/store';
import { perExp } from '../calculators/session';
import type { TrainingAssumptions } from '../models/types';

const A: TrainingAssumptions = { ...DEFAULT_ASSUMPTIONS, castsPerSecond: 1, uptime: 1, respawnSeconds: 10, spawnShare: 1, travelMinutes: 0, packSize: 1 };
const atk = (dmg: number, extra: Partial<ResolvedAttack> = {}): ResolvedAttack => ({
  line: { min: dmg, avg: dmg, max: dmg, hitRate: 1 },
  linesPerCast: 1,
  maxTargets: 1,
  mpPerCast: 10,
  starsPerCast: 0,
  provenance: 'measured',
  notes: [],
  ...extra,
});

function spawn(name: string, hp: number, exp: number, points: number, a: ResolvedAttack, as = A): SpawnInput {
  return { mobId: 1, name, exp, spawnPoints: points, atk: a, eval: evaluateMonster(hp, exp, a, as) };
}

describe('evaluateMonster', () => {
  it('computes EXP per cast from casts to kill', () => {
    const e = evaluateMonster(100, 20, atk(50), A);
    expect(e.kill.expected).toBe(2);
    expect(e.expPerCast).toBe(10);
    expect(e.attackKillsPerMin).toBe(30);
  });

  it('multi-target skills scale kills per cast by targets hit', () => {
    const tb = atk(50, { maxTargets: 6 });
    expect(evaluateMonster(100, 20, tb, { ...A, packSize: 4 }).killsPerCast).toBe(2);
    expect(evaluateMonster(100, 20, tb, { ...A, mobsPerCast: 6 }).killsPerCast).toBe(3);
    // override cannot exceed the skill's own target cap
    expect(evaluateMonster(100, 20, atk(50), { ...A, mobsPerCast: 6 }).targets).toBe(1);
  });
});

describe('evaluateMap: EXP/cast is not EXP/min', () => {
  it('a high EXP/cast monster can lose on EXP/min when spawns are scarce', () => {
    // Big monster: 2 casts/kill, 100 EXP -> 50 EXP/cast, but only 2 spawn points.
    const big = evaluateMap([spawn('Big', 200, 100, 2, atk(100))], A);
    // Small monster: 1 cast/kill, 30 EXP -> 30 EXP/cast, 20 spawn points.
    const small = evaluateMap([spawn('Small', 50, 30, 20, atk(100))], A);
    expect(big.expPerCast).toBeGreaterThan(small.expPerCast);
    expect(big.limitedBy).toBe('spawns');
    expect(big.killsPerMin).toBeCloseTo(12); // 2 points * 60/10
    expect(small.netExpPerMin).toBeGreaterThan(big.netExpPerMin);
  });

  it('is attack-limited when spawns are plentiful', () => {
    const r = evaluateMap([spawn('Mob', 100, 10, 50, atk(50))], A);
    expect(r.limitedBy).toBe('attack');
    expect(r.killsPerMin).toBe(30);
    expect(r.grossExpPerMin).toBe(300);
    expect(r.castsPerMin).toBe(60);
    expect(r.mpPerMin).toBe(600);
    expect(perExp(r.mpPerMin, r.grossExpPerMin)).toBe(2);
    expect(perExp(100, 0)).toBeNull();
  });

  it('applies uptime, travel and death penalty', () => {
    const as = { ...A, uptime: 0.5, sessionMinutes: 60, travelMinutes: 20, deathsPerHour: 1, deathExpLossPct: 10 };
    const r = evaluateMap([spawn('Mob', 100, 10, 50, atk(50), as)], as, 6000);
    expect(r.killsPerMin).toBe(15);
    expect(r.travelFactor).toBeCloseTo(0.75);
    expect(r.deathExpPerMin).toBeCloseTo(10); // 10% of 6000 per hour
    expect(r.netExpPerMin).toBeCloseTo(150 * 0.75 - 10);
    expect(r.minutesToLevel).toBeCloseTo(6000 / r.netExpPerMin);
  });

  it('weights a mixed map by spawn share', () => {
    const r = evaluateMap([spawn('A', 50, 10, 10, atk(50)), spawn('B', 100, 40, 10, atk(50))], A);
    expect(r.expPerKill).toBe(25);
    expect(r.attackKillsPerMin).toBeCloseTo(60 / 1.5);
  });

  it('prices potions and stars', () => {
    const as = { ...A, mpPotionMp: 100, mpPotionPrice: 50, starRechargePricePerStar: 2 };
    const r = evaluateMap([spawn('Mob', 100, 10, 50, atk(50, { starsPerCast: 2 }), as)], as);
    expect(r.costBreakdown.mp).toBeCloseTo((600 / 100) * 50);
    expect(r.starsPerMin).toBe(120);
    expect(r.costBreakdown.stars).toBe(240);
  });

  it('returns zero for unkillable maps', () => {
    const r = evaluateMap([spawn('Wall', 100, 10, 5, atk(0))], A);
    expect(r.limitedBy).toBe('cannot_kill');
    expect(r.netExpPerMin).toBe(0);
  });
});
