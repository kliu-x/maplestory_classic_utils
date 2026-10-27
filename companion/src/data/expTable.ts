import type { SourceMeta } from '../models/types';

// EXP needed to go from level N to N+1 (index 0 = level 1). Level 100 is the cap.
// Community table; it matches the pre-Big-Bang curve, so check it against the in-game
// EXP bar tooltip if numbers look off.
export const EXP_TABLE_SOURCE: SourceMeta = {
  source_url: 'https://meowdb.com/msclassic/guides/exp-table-level-1-to-100',
  source_title: 'MeowDB: EXP table level 1 to 100 (Classic World)',
  retrieved_at: '2026-10-27',
  game_version_or_date: 'Classic World launch (2026-10-21)',
  verification_status: 'community_reported',
};

const EXP_TO_NEXT = [
  15, 34, 57, 92, 135, 372, 560, 840, 1242, 1716, 2360, 3216, 4200, 5460, 7050, 8840, 11040, 13716, 16680, 20216,
  24402, 28980, 34320, 40512, 47216, 54900, 63666, 73080, 83720, 95700, 108480, 122760, 138666, 155540, 174216, 194832, 216600, 240500, 266682, 294216,
  324240, 356916, 391160, 428280, 468450, 510420, 555680, 604416, 655200, 709716, 748608, 789631, 832902, 878545, 926689, 977471, 1031036, 1087536, 1147132, 1209994,
  1276301, 1346242, 1420016, 1497832, 1579913, 1666492, 1757815, 1854143, 1955750, 2062925, 2175973, 2295216, 2420993, 2553663, 2693603, 2841212, 2996910, 3161140, 3334370, 3517093,
  3709829, 3913127, 4127566, 4353756, 4592341, 4844001, 5109452, 5389449, 5684790, 11938059, 25069923, 52646838, 110558359, 232172553, 487562361, 1023880958, 2150150011, 4515315023, 9482161548,
];

/** EXP required for the whole of `level` (0 at the level cap). */
export function expForLevel(level: number): number {
  return EXP_TO_NEXT[Math.round(level) - 1] ?? 0;
}

/** EXP still needed to level up, given the current EXP shown in game. */
export function expRemaining(level: number, currentExp: number): number {
  return Math.max(0, expForLevel(level) - Math.max(0, currentExp));
}
