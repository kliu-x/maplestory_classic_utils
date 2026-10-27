import { expForLevel, expRemaining } from '../data/expTable';
import type { Character, GameMap, MapLane, Monster, TrainingAssumptions } from '../models/types';
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
  /** Set when the row is one lane of the map rather than the whole map. */
  lane?: { index: number; of: number; lane: MapLane };
  /** Whole-map result, kept for comparison when the row is a lane. */
  wholeMap?: MapEval;
}

export function evaluateMonsterFor(c: Character, skillId: number | null, m: Monster, a: TrainingAssumptions): MonsterRow {
  const atk = resolveAttack(c, skillId, m, a);
  return { monster: m, atk, eval: evaluateMonster(m.hp, m.exp, atk, a) };
}

export function evaluateMapFor(c: Character, skillId: number | null, map: GameMap, a: TrainingAssumptions, cache?: Map<number, MonsterRow>, lane?: MapLane): MapRow {
  const spawns: SpawnInput[] = [];
  for (const s of lane?.spawns ?? map.spawns) {
    const m = monsterById.get(s.mobId);
    if (!m || m.isBoss) continue;
    let row = cache?.get(m.id);
    if (!row) {
      row = evaluateMonsterFor(c, skillId, m, a);
      cache?.set(m.id, row);
    }
    spawns.push({ mobId: m.id, name: m.name, exp: m.exp, spawnPoints: s.count, eval: row.eval, atk: row.atk });
  }
  const share = lane ? { ...a, spawnShare: a.laneSpawnShare } : a;
  return { map, spawns, result: evaluateMap(spawns, share, expRemaining(c.level, c.currentExp ?? 0), expForLevel(c.level)) };
}

export const MIN_LANE_SPAWNS = 3;

/**
 * Best way to train on a map: the whole map, or one lane if staying on it earns more
 * (e.g. a lane of Octopus + 1 Orange Mushroom beats roaming past Stumps and Snails).
 */
export function bestOnMap(c: Character, skillId: number | null, map: GameMap, a: TrainingAssumptions, cache?: Map<number, MonsterRow>): MapRow {
  const whole = evaluateMapFor(c, skillId, map, a, cache);
  if (!map.lanes || a.useLanes === false) return whole;
  let best = whole;
  map.lanes.forEach((lane, index) => {
    // A ledge with one or two spawn points is not somewhere to train.
    if (lane.spawns.reduce((t, s) => t + s.count, 0) < MIN_LANE_SPAWNS) return;
    const row = evaluateMapFor(c, skillId, map, a, cache, lane);
    if (row.result.netExpPerMin > best.result.netExpPerMin) best = { ...row, lane: { index, of: map.lanes!.length, lane }, wholeMap: whole.result };
  });
  return best;
}

/** "Lane 2 of 4 (from top), left side": where to stand, from the inferred lane bounds. */
export function laneLabel(row: MapRow): string | null {
  if (!row.lane) return null;
  const { index, of, lane } = row.lane;
  const lanes = row.map.lanes ?? [];
  const lo = Math.min(...lanes.map((l) => l.xMin));
  const hi = Math.max(...lanes.map((l) => l.xMax));
  const mid = (lane.xMin + lane.xMax) / 2;
  const third = (hi - lo) / 3;
  const side = hi - lo < 1 || lane.xMax - lane.xMin > (hi - lo) * 0.6 ? '' : mid < lo + third ? ', left side' : mid > hi - third ? ', right side' : ', middle';
  return `Lane ${index + 1} of ${of} from the top${side}`;
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
    .map((m) => bestOnMap(c, skillId, m, a, cache))
    .filter((r) => r.result.netExpPerMin > 0)
    // Ties (common when only one species is killable) go to maps with fewer unkillable spawns.
    .sort((x, y) => y.result.netExpPerMin - x.result.netExpPerMin || y.result.killableShare - x.result.killableShare);
}

/** Damage provenance of the killable species with the most spawn points (what the EXP/min mostly rests on). */
export function mainProvenance(row: MapRow) {
  const killable = row.spawns.filter((s) => s.eval.killsPerCast > 0).sort((a, b) => b.spawnPoints - a.spawnPoints);
  return (killable[0] ?? row.spawns[0])?.atk.provenance ?? 'none';
}
