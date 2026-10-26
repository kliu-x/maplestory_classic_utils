// Training-spot evaluation. EXP/cast and EXP/min are deliberately separate:
// EXP/cast only says how efficient each attack is; EXP/min also depends on attack
// speed, downtime, how many monsters the map actually spawns, travel and deaths.

import type { TrainingAssumptions } from '../models/types';
import { castsToKill, type KillStats, type LineDamage } from './damage';

export interface ResolvedAttack {
  line: LineDamage; // per-line damage against THIS monster (after any adjustments)
  linesPerCast: number;
  maxTargets: number;
  mpPerCast: number;
  starsPerCast: number;
  provenance: 'measured' | 'projected' | 'estimated' | 'none';
  notes: string[];
}

export interface MonsterEval {
  kill: KillStats;
  targets: number; // monsters hit per cast
  killsPerCast: number;
  expPerCast: number;
  /** Attack-limited kills per minute (ignores spawn limits). */
  attackKillsPerMin: number;
}

export function targetsPerCast(maxTargets: number, a: TrainingAssumptions): number {
  if (a.mobsPerCast != null && a.mobsPerCast > 0) return Math.min(a.mobsPerCast, Math.max(1, maxTargets));
  return Math.max(1, Math.min(maxTargets, a.packSize));
}

export function evaluateMonster(hp: number, exp: number, atk: ResolvedAttack, a: TrainingAssumptions): MonsterEval {
  const kill = castsToKill(hp, atk.line, atk.linesPerCast);
  const targets = targetsPerCast(atk.maxTargets, a);
  // Multi-target spells hit every monster in range each cast, so a pack of `targets`
  // monsters dies in roughly the same number of casts as one monster.
  const killsPerCast = Number.isFinite(kill.expected) && kill.expected > 0 ? targets / kill.expected : 0;
  const castsPerMin = a.castsPerSecond * 60 * a.uptime;
  return {
    kill,
    targets,
    killsPerCast,
    expPerCast: exp * killsPerCast,
    attackKillsPerMin: castsPerMin * killsPerCast,
  };
}

export interface SpawnInput {
  mobId: number;
  name: string;
  exp: number;
  spawnPoints: number;
  eval: MonsterEval;
  atk: ResolvedAttack;
}

export interface MapEval {
  killsPerMin: number;
  limitedBy: 'attack' | 'spawns' | 'cannot_kill';
  attackKillsPerMin: number;
  spawnKillsPerMin: number;
  expPerKill: number;
  expPerCast: number;
  grossExpPerMin: number;
  netExpPerMin: number;
  expPerHour: number;
  castsPerMin: number;
  mpPerMin: number;
  starsPerMin: number;
  mesoCostPerMin: number;
  costBreakdown: { mp: number; hp: number; stars: number };
  travelFactor: number;
  deathExpPerMin: number;
  minutesToLevel: number | null;
  /** Share of the map's spawn points that this attack can kill (0..1). */
  killableShare: number;
  notes: string[];
}

/**
 * Evaluate a map with one or more monster species. Kills are assumed to follow the
 * spawn mix (you attack whatever is nearby), so per-kill time and EXP are spawn-weighted.
 */
export function evaluateMap(spawns: SpawnInput[], a: TrainingAssumptions, expToNext?: number): MapEval {
  const notes: string[] = [];
  const killable = spawns.filter((s) => s.eval.killsPerCast > 0 && s.spawnPoints > 0);
  const totalPoints = killable.reduce((t, s) => t + s.spawnPoints, 0);
  const allPoints = spawns.reduce((t, s) => t + s.spawnPoints, 0);
  const empty: MapEval = {
    killsPerMin: 0, limitedBy: 'cannot_kill', attackKillsPerMin: 0, spawnKillsPerMin: 0, expPerKill: 0, expPerCast: 0,
    grossExpPerMin: 0, netExpPerMin: 0, expPerHour: 0, castsPerMin: 0, mpPerMin: 0, starsPerMin: 0, mesoCostPerMin: 0,
    costBreakdown: { mp: 0, hp: 0, stars: 0 }, travelFactor: 1, deathExpPerMin: 0, minutesToLevel: null, killableShare: 0, notes,
  };
  if (totalPoints === 0) {
    notes.push('No killable monsters with known spawn points.');
    return empty;
  }
  if (killable.length < spawns.length) notes.push('Some monsters on this map are excluded (cannot be killed with this attack).');

  // Spawn-weighted averages per kill.
  let castsPerKill = 0;
  let expPerKill = 0;
  let mpPerKill = 0;
  let starsPerKill = 0;
  for (const s of killable) {
    const w = s.spawnPoints / totalPoints;
    const c = 1 / s.eval.killsPerCast;
    castsPerKill += w * c;
    expPerKill += w * s.exp;
    mpPerKill += w * c * s.atk.mpPerCast;
    starsPerKill += w * c * s.atk.starsPerCast;
  }

  const castsPerMinCap = a.castsPerSecond * 60 * a.uptime;
  const attackKillsPerMin = castsPerMinCap / castsPerKill;
  const respawn = Math.max(1, a.respawnSeconds);
  const spawnKillsPerMin = (totalPoints * a.spawnShare * 60) / respawn;
  const killsPerMin = Math.min(attackKillsPerMin, spawnKillsPerMin);
  const limitedBy = attackKillsPerMin <= spawnKillsPerMin ? 'attack' : 'spawns';
  const castsPerMin = killsPerMin * castsPerKill;

  const grossExpPerMin = killsPerMin * expPerKill;
  const session = Math.max(1, a.sessionMinutes);
  const travelFactor = session / (session + Math.max(0, a.travelMinutes));
  let deathExpPerMin = 0;
  if (a.deathsPerHour > 0) {
    if (expToNext && expToNext > 0) deathExpPerMin = (a.deathsPerHour * (a.deathExpLossPct / 100) * expToNext) / 60;
    else notes.push('Death penalty ignored: set "EXP to next level" on the character.');
  }
  const netExpPerMin = Math.max(0, grossExpPerMin * travelFactor - deathExpPerMin);

  const mpPerMin = killsPerMin * mpPerKill;
  const starsPerMin = killsPerMin * starsPerKill;
  const mp = a.mpPotionMp > 0 ? (mpPerMin / a.mpPotionMp) * a.mpPotionPrice : 0;
  const hp = a.hpPotionHp > 0 ? (a.hpPotionHpPerMin / a.hpPotionHp) * a.hpPotionPrice : 0;
  const stars = starsPerMin * a.starRechargePricePerStar;

  return {
    killsPerMin,
    limitedBy,
    attackKillsPerMin,
    spawnKillsPerMin,
    expPerKill,
    expPerCast: expPerKill / castsPerKill,
    grossExpPerMin,
    netExpPerMin,
    expPerHour: netExpPerMin * 60,
    castsPerMin,
    mpPerMin,
    starsPerMin,
    mesoCostPerMin: mp + hp + stars,
    costBreakdown: { mp, hp, stars },
    travelFactor,
    deathExpPerMin,
    minutesToLevel: expToNext && netExpPerMin > 0 ? expToNext / netExpPerMin : null,
    killableShare: allPoints ? totalPoints / allPoints : 0,
    notes,
  };
}
