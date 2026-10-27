import { expForLevel, expRemaining } from '../data/expTable';
import type { Character, GameMap, Monster, TrainingAssumptions } from '../models/types';
import { MAPS, monsterById } from '../data';
import { resolveAttack } from './attack';
import { evaluateMap, evaluateMonster, type MapEval, type MonsterEval, type ResolvedAttack, type SpawnInput } from './training';

export interface MonsterRow {
  monster: Monster;
  atk: ResolvedAttack;
  eval: MonsterEval;
}

export interface MapRow {
  map: GameMap;
  spawns: SpawnInput[];
  result: MapEval;
}

export function evaluateMonsterFor(c: Character, skillId: number | null, m: Monster, a: TrainingAssumptions): MonsterRow {
  const atk = resolveAttack(c, skillId, m, a);
  return { monster: m, atk, eval: evaluateMonster(m.hp, m.exp, atk, a) };
}

export function evaluateMapFor(c: Character, skillId: number | null, map: GameMap, a: TrainingAssumptions, cache?: Map<number, MonsterRow>): MapRow {
  const spawns: SpawnInput[] = [];
  for (const s of map.spawns) {
    const m = monsterById.get(s.mobId);
    if (!m || m.isBoss) continue;
    let row = cache?.get(m.id);
    if (!row) {
      row = evaluateMonsterFor(c, skillId, m, a);
      cache?.set(m.id, row);
    }
    spawns.push({ mobId: m.id, name: m.name, exp: m.exp, spawnPoints: s.count, eval: row.eval, atk: row.atk });
  }
  return { map, spawns, result: evaluateMap(spawns, a, expRemaining(c.level, c.currentExp ?? 0), expForLevel(c.level)) };
}

/**
 * Classic World numbers party-quest/event copies of monsters from 800000 up (e.g. KPQ Ligator 800000,
 * King Slime 800003). Their maps are PQ stages, not open training spots.
 */
export const isPqVariant = (mobId: number) => mobId >= 800000;

export interface RankOptions {
  /** Ignore maps whose monsters are all this many levels above the character. */
  maxLevelAbove?: number;
}

export function rankMaps(c: Character, skillId: number | null, a: TrainingAssumptions, opts: RankOptions = {}): MapRow[] {
  const cache = new Map<number, MonsterRow>();
  const maxAbove = opts.maxLevelAbove ?? 15;
  return MAPS.filter((m) => !m.isTown && m.spawns.some((s) => !isPqVariant(s.mobId)))
    .filter((m) => m.spawns.some((s) => (monsterById.get(s.mobId)?.level ?? 999) <= c.level + maxAbove))
    .map((m) => evaluateMapFor(c, skillId, m, a, cache))
    .filter((r) => r.result.netExpPerMin > 0)
    // Ties (common when only one species is killable) go to maps with fewer unkillable spawns.
    .sort((x, y) => y.result.netExpPerMin - x.result.netExpPerMin || y.result.killableShare - x.result.killableShare);
}

/** Damage provenance of the killable species with the most spawn points (what the EXP/min mostly rests on). */
export function mainProvenance(row: MapRow) {
  const killable = row.spawns.filter((s) => s.eval.killsPerCast > 0).sort((a, b) => b.spawnPoints - a.spawnPoints);
  return (killable[0] ?? row.spawns[0])?.atk.provenance ?? 'none';
}
