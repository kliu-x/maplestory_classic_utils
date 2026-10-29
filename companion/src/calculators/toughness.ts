// Flags a monster whose W.DEF, M.DEF or evasion is well above other monsters near its level.

import type { Monster } from '../models/types';

export type ToughStat = 'pdd' | 'mdd' | 'evasion';

export const TOUGH_LABEL: Record<ToughStat, string> = { pdd: 'W.DEF', mdd: 'M.DEF', evasion: 'EVA' };

/** "High" = at least 2× the median of peers within ±LEVEL_WINDOW levels, and above it by a minimum gap. */
export const LEVEL_WINDOW = 5;
const RATIO = 2;
const MIN_GAP: Record<ToughStat, number> = { pdd: 15, mdd: 15, evasion: 5 };

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export interface ToughTag {
  stat: ToughStat;
  value: number;
  peerMedian: number;
}

export function toughTags(m: Monster, all: Monster[]): ToughTag[] {
  const peers = all.filter((o) => o.id !== m.id && !o.isBoss && Math.abs(o.level - m.level) <= LEVEL_WINDOW);
  if (peers.length < 3) return [];
  const out: ToughTag[] = [];
  for (const stat of ['pdd', 'mdd', 'evasion'] as ToughStat[]) {
    const med = median(peers.map((o) => o[stat]));
    const v = m[stat];
    if (v >= med * RATIO && v - med >= MIN_GAP[stat]) out.push({ stat, value: v, peerMedian: med });
  }
  return out;
}

/** Precompute tags for every monster (cheap: ~100 monsters). */
export function toughTagMap(all: Monster[]): Map<number, ToughTag[]> {
  return new Map(all.map((m) => [m.id, toughTags(m, all)]));
}
