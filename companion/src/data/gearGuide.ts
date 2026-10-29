// Gear picks by level checkpoint, from Classic World community guides (mostly MeowDB),
// researched 2026-10-28. Guides list gear by level but rarely say "best" or "budget", so
// the tiers are this app's grouping: best = highest stats a guide lists for that level,
// affordable = the cheaper alternative it mentions, accessible = NPC shop or quest item.
// Prices are estimates: NPC launch prices, a single Free Market snapshot, or a craft fee
// (materials not included). Conflicts between sources are kept, not resolved.

import type { JobId, SourceMeta } from '../models/types';
import { JOBS } from './rules';
import raw from './gearGuide.json';

export type GearTier = 'bis' | 'affordable' | 'accessible';
export type CostKind = 'npc_shop' | 'market_estimate' | 'craft_fee';

export interface GearPick {
  family: 'warrior' | 'magician' | 'bowman' | 'thief' | 'all';
  /** null = any branch of the class. */
  branch: string | null;
  level: number;
  slot: string;
  tier: GearTier;
  item: string;
  /** MeowDB's own item number (not a game item ID). */
  meowdbId: number | null;
  reqLevel: number | null;
  stats: string | null;
  howToGet: string | null;
  estCost: number | null;
  costKind: CostKind | null;
  costNote: string | null;
  /** false = only found in a shop list, no guide recommends it. */
  guidePick: boolean;
  sourceIds: string[];
  conflict: string | null;
}

export const GEAR_SOURCES = raw.sources as Record<string, SourceMeta>;
export const GEAR_PICKS = raw.picks as GearPick[];
export const GEAR_NOTES = raw.notes as { topic: string; text: string; sourceIds: string[] }[];

export const TIER_LABEL: Record<GearTier, string> = { bis: 'Best in slot', affordable: 'Affordable', accessible: 'Easy to get' };
export const COST_LABEL: Record<CostKind, string> = { npc_shop: 'NPC shop', market_estimate: 'Free Market estimate', craft_fee: 'craft fee + materials' };
export const SLOT_ORDER = ['weapon', 'ammo', 'shield', 'hat', 'overall', 'top', 'bottom', 'gloves', 'shoes', 'cape', 'earrings'];

/** Weapon branches per class, in the guides' words; the character's job picks one when it can. */
export const BRANCHES: Record<string, { id: string; label: string }[]> = {
  warrior: [{ id: 'fighter', label: 'Sword / axe' }, { id: 'spearman', label: 'Spear / polearm' }],
  bowman: [{ id: 'bow', label: 'Bow' }, { id: 'crossbow', label: 'Crossbow' }],
  thief: [{ id: 'claw', label: 'Claw (Assassin)' }, { id: 'dagger', label: 'Dagger (Bandit)' }],
  magician: [],
};

export function gearFamily(job: JobId): GearPick['family'] | null {
  const f = JOBS[job].family;
  return f === 'Warrior' ? 'warrior' : f === 'Magician' ? 'magician' : f === 'Bowman' ? 'bowman' : f === 'Thief' ? 'thief' : null;
}

export function defaultBranch(job: JobId): string | null {
  return job === 'assassin' ? 'claw' : job === 'bandit' ? 'dagger' : null;
}

/** Level checkpoints the guides cover for a class (a branch's odd levels like 17 fold into the nearest lower checkpoint). */
export const CHECKPOINTS = [10, 15, 20, 25, 30, 35];
export const checkpointOf = (level: number) => [...CHECKPOINTS].reverse().find((c) => level >= c) ?? CHECKPOINTS[0];

/** Picks for one class/branch at one checkpoint, grouped by slot, best tier first. */
export function picksAt(family: GearPick['family'], branch: string | null, checkpoint: number): { slot: string; picks: GearPick[] }[] {
  const tierRank: Record<GearTier, number> = { bis: 0, affordable: 1, accessible: 2 };
  const hits = GEAR_PICKS.filter(
    (p) => (p.family === family || p.family === 'all') && checkpointOf(p.level) === checkpoint && (p.branch == null || branch == null || p.branch === branch),
  );
  const slots = [...new Set(hits.map((p) => p.slot))].sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b));
  return slots.map((slot) => ({ slot, picks: hits.filter((p) => p.slot === slot).sort((a, b) => tierRank[a.tier] - tierRank[b.tier]) }));
}
