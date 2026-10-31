// Getting around: shortest portal route from the nearest town, and minimap positions.
// Pure functions over the map graph so they can be unit-tested.

import type { GameMap } from '../models/types';

/** Home towns: maps that some other map sends you back to, and that are towns themselves. */
export function hubTowns(maps: GameMap[]): Set<number> {
  const town = new Set(maps.filter((m) => m.isTown).map((m) => m.id));
  return new Set(maps.map((m) => m.returnMap).filter((id): id is number => id != null && town.has(id)));
}

/** The town you would respawn in from `mapId` (or the map itself if it is a home town). */
export function homeTown(maps: GameMap[], mapId: number): number | null {
  const hubs = hubTowns(maps);
  if (hubs.has(mapId)) return mapId;
  const m = maps.find((x) => x.id === mapId);
  return m?.returnMap != null && hubs.has(m.returnMap) ? m.returnMap : null;
}

/**
 * Shortest chain of maps from a home town to `target` (inclusive), following portals.
 * Portals are treated as two-way because many return portals are missing from the files.
 * Returns null if the target cannot be reached that way (ships, taxis, hidden portals).
 */
export function routeFromTown(maps: GameMap[], target: number): number[] | null {
  const byId = new Map(maps.map((m) => [m.id, m]));
  if (!byId.has(target)) return null;
  const adj = new Map<number, Set<number>>();
  const link = (a: number, b: number) => {
    if (!byId.has(a) || !byId.has(b) || a === b) return;
    (adj.get(a) ?? adj.set(a, new Set()).get(a)!).add(b);
    (adj.get(b) ?? adj.set(b, new Set()).get(b)!).add(a);
  };
  for (const m of maps) for (const to of m.portalsTo) link(m.id, to);
  // Breadth-first from the target until the first home town: that one is the nearest.
  const hubs = hubTowns(maps);
  const prev = new Map<number, number>([[target, target]]);
  const queue = [target];
  while (queue.length) {
    const id = queue.shift()!;
    if (hubs.has(id)) {
      const path = [id];
      while (path[path.length - 1] !== target) path.push(prev.get(path[path.length - 1])!);
      return path;
    }
    for (const n of adj.get(id) ?? []) {
      if (prev.has(n)) continue;
      prev.set(n, id);
      queue.push(n);
    }
  }
  return null;
}

/** Plain words for where a spot is on a map, for maps where it is easy to miss. */
export function whereOnMap(map: GameMap, x: number, y: number): string | null {
  const mm = map.miniMap;
  if (!mm) return null;
  const fy = (y + mm.centerY) / mm.height;
  const fx = (x + mm.centerX) / mm.width;
  const up = fy < 0.15 ? 'the very top' : fy < 0.4 ? 'the upper part' : fy < 0.6 ? 'the middle' : fy < 0.85 ? 'the lower part' : 'the very bottom';
  const side = fx < 0.33 ? 'left side' : fx > 0.67 ? 'right side' : 'centre';
  const climb = mm.height >= 3000 && fy < 0.4 ? ' This map is tall, so keep climbing.' : '';
  return `At ${up} of the map, ${side}.${climb}`;
}

/** World coordinates -> minimap image pixels (the image is the map shrunk by 2^magnification). */
export function minimapPoint(map: GameMap, x: number, y: number): { left: number; top: number; width: number; height: number } | null {
  const mm = map.miniMap;
  if (!mm) return null;
  const k = 2 ** mm.magnification;
  return { left: (x + mm.centerX) / k, top: (y + mm.centerY) / k, width: mm.width / k, height: mm.height / k };
}
