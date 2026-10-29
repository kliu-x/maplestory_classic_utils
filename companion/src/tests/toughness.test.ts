import { describe, expect, it } from 'vitest';
import type { Monster } from '../models/types';
import { MONSTERS } from '../data';
import { toughTagMap, toughTags } from '../calculators/toughness';

const mob = (id: number, level: number, pdd: number, mdd: number, evasion: number) =>
  ({ id, level, pdd, mdd, evasion, isBoss: false }) as Monster;

describe('high defense / evasion notes', () => {
  const peers = [mob(1, 10, 10, 10, 5), mob(2, 11, 12, 10, 6), mob(3, 9, 8, 12, 4), mob(4, 12, 10, 10, 5)];

  it('flags a stat well above monsters near its level', () => {
    const tank = mob(9, 10, 40, 10, 5);
    const tags = toughTags(tank, [...peers, tank]);
    expect(tags.map((t) => t.stat)).toEqual(['pdd']);
    expect(tags[0].peerMedian).toBe(10);
  });

  it('ignores small gaps and far-off levels', () => {
    const slight = mob(9, 10, 14, 10, 8); // 1.4× and +4: not "high"
    expect(toughTags(slight, [...peers, slight])).toEqual([]);
    const far = mob(9, 40, 99, 99, 99); // no peers within 5 levels
    expect(toughTags(far, [...peers, far])).toEqual([]);
  });

  it('runs over the real Classic World data; Snail is not tough', () => {
    const map = toughTagMap(MONSTERS);
    expect(map.size).toBe(MONSTERS.length);
    expect(map.get(2)).toEqual([]);
  });
});
