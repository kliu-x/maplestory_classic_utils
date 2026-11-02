// Everything the app knows about where an item comes from. The game files give stats,
// requirements, slots and the NPC sell price; shop lists and drop tables are server-side,
// so shops come from guide gear picks and drops from player reports or name guesses.

import type { Item, Quest, StatKey } from '../models/types';
import { GEAR_PICKS, type GearPick } from './gearGuide';

export const STAT_LABEL: Record<string, string> = {
  WAT: 'Weapon ATT', MAD: 'Magic ATT', PDD: 'Weapon DEF', MDD: 'Magic DEF', STR: 'STR', DEX: 'DEX', INT: 'INT', LUK: 'LUK',
  ACC: 'Accuracy', EVA: 'Avoidability', MHP: 'Max HP', MMP: 'Max MP', Speed: 'Speed', Jump: 'Jump', CRT: 'Crit rate %', CRD: 'Crit damage %',
};
/** Order stats the way the in-game tooltip does. */
const STAT_ORDER = ['STR', 'DEX', 'INT', 'LUK', 'MHP', 'MMP', 'WAT', 'MAD', 'PDD', 'MDD', 'ACC', 'EVA', 'CRT', 'CRD', 'Speed', 'Jump'];
/** Shown as a plain number ("Magic ATT 48"); the rest as a bonus ("INT +3"). */
export const BASE_STATS = ['WAT', 'MAD', 'PDD', 'MDD'];
export const sortedStats = (stats: Record<string, number> = {}) =>
  Object.entries(stats).sort(([a], [b]) => (STAT_ORDER.indexOf(a) + 1 || 99) - (STAT_ORDER.indexOf(b) + 1 || 99));

export const JOB_BITS: [number, string][] = [[1, 'Warrior'], [2, 'Magician'], [4, 'Bowman'], [8, 'Thief'], [16, 'Pirate']];
export const jobsOf = (mask?: number) => (mask ? JOB_BITS.filter(([b]) => mask & b).map(([, name]) => name) : []);
const FAMILY_BIT: Record<string, number> = { Warrior: 1, Magician: 2, Bowman: 4, Thief: 8, Pirate: 16 };
export const usableBy = (item: Item, family: string) => !item.reqJob || !!(item.reqJob & (FAMILY_BIT[family] ?? 0));

/** One-line summary, e.g. "Magic ATT 48 · INT +3 · 7 slots". */
export function statLine(item: Item): string {
  const s = sortedStats(item.stats).map(([k, v]) => (BASE_STATS.includes(k) ? `${STAT_LABEL[k] ?? k} ${v}` : `${STAT_LABEL[k] ?? k} ${v > 0 ? '+' : ''}${v}`));
  if (item.slots) s.push(`${item.slots} slots`);
  return s.join(' · ');
}

const norm = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Item names a gear pick mentions ("Blue Doros Robe (male) / Brown Doroness Robe (female)" -> both). */
export const pickNames = (p: GearPick) => p.item.split(/\s*\/\s*/).map(norm).filter(Boolean);

/** Gear picks (with shop/craft/market prices) that name this item. */
export function gearPicksFor(item: Item): GearPick[] {
  const n = norm(item.name);
  return GEAR_PICKS.filter((p) => pickNames(p).includes(n));
}

/** Items a gear pick refers to. */
export function itemsForPick(p: GearPick, items: Item[]): Item[] {
  const names = new Set(pickNames(p));
  return items.filter((i) => names.has(norm(i.name)));
}

export function questsFor(itemId: number, quests: Quest[]) {
  return {
    rewards: quests.filter((q) => q.rewardItems.some((r) => r.itemId === itemId)),
    needs: quests.filter((q) => q.collectItems.some((r) => r.itemId === itemId)),
  };
}

export type { StatKey };
