// Community-reported damage formulas (MeowDB "Explaining the damage formula", updated
// 2026-10-21). NOT confirmed for Classic World: every result from this file is an
// estimate and the UI labels it so. Measured damage always takes priority.

import type { ElementEffect } from '../models/types';

export const mastery = (level: number) => (Math.min(10, Math.max(0, level)) / 10 + 0.1) * 0.7;

/** Spell min/max per line. skillPower = the skill's MAD value (e.g. Magic Claw 65 at Lv 20). */
export function magicRange(opts: { skillPower: number; totalInt: number; matk: number; spellMastery?: number }) {
  const S = opts.skillPower / 100;
  const total = Math.floor(opts.totalInt / 2) + opts.matk;
  const M = mastery(opts.spellMastery ?? 0);
  const max = S * total * (1 + opts.totalInt / 125);
  const min = S * total * (1 + (opts.totalInt * M) / 125);
  return { min, max, avg: (min + max) / 2 };
}

/** Physical min/max per line (claw stars: weaponMult 2.5; Lucky Seven: 3.0 with mastery fixed at 0.5). */
export function physicalRange(opts: {
  skillPercent: number;
  totalWatk: number;
  primary: number;
  secondary: number;
  weaponMult: number;
  masteryLevel?: number;
  masteryOverride?: number;
}) {
  const S = opts.skillPercent / 100;
  const M = opts.masteryOverride ?? mastery(opts.masteryLevel ?? 0);
  const max = S * opts.totalWatk * (1.0 + (opts.primary * opts.weaponMult + opts.secondary) / 100);
  const min = S * opts.totalWatk * (0.8 + (opts.primary * M * opts.weaponMult + opts.secondary) / 100);
  const avg = S * opts.totalWatk * (0.9 + ((opts.primary * (M + 1)) / 2 * opts.weaponMult + opts.secondary) / 100);
  return { min, max, avg };
}

/** Raw -> after defense: Raw x 100 / (DEF + 100). */
export const defenseFactor = (def: number) => 100 / (Math.max(0, def) + 100);

export const levelGapFactor = (mobLevel: number, playerLevel: number) => {
  const gap = mobLevel - playerLevel;
  if (gap <= 0) return 1;
  if (gap < 10) return 1 / (1 + gap * gap * 0.005);
  return 1 / (1 + gap * 0.05);
};

/**
 * Element multipliers. CONFLICTING sources: the legacy pre-Big-Bang convention is weak 1.5 /
 * resist 0.5; MeowDB lists Weak 1.25, Resistant 0.75, Half 0.5. The WZ code mapping
 * (1 immune, 2 resist, 3 weak) itself is the legacy convention.
 */
export const ELEMENT_MULT: Record<'meowdb' | 'legacy', Record<ElementEffect, number>> = {
  meowdb: { immune: 0, resist: 0.5, weak: 1.25 },
  legacy: { immune: 0, resist: 0.5, weak: 1.5 },
};

/** Hit chance (accuracy) model from the same guide. */
export function hitChance(opts: { totalAcc: number; mobEva: number; mobLevel: number; playerLevel: number }) {
  const L = Math.max(0, opts.mobLevel - opts.playerLevel);
  const A = (opts.totalAcc * 100) / (10 * L + 255);
  if (opts.mobEva <= 0) return 1;
  if (A <= 0) return 0;
  const D = A - opts.mobEva;
  if (D >= 25 + L * (0.5 * opts.playerLevel + 15)) return 1;
  const f = 0.15 + 0.2 / (1 + Math.exp(D / 12));
  const q = opts.mobEva / A;
  if (q <= 1 - f) return 1;
  if (q >= 1 + f) return 0;
  return (1 + f - q) / (2 * f);
}

export function derivedAccuracy(family: string, level: number, s: { str: number; dex: number; int: number; luk: number }) {
  const common = 1.2 * s.dex + 2 * level + 0.6 * s.luk;
  switch (family) {
    case 'Magician':
      return Math.floor((1.2 * s.int + 2 * level + 0.6 * s.luk) / 5.1 + 20);
    case 'Thief':
      return Math.floor(common / 4 + 15);
    case 'Bowman':
      return Math.floor(common / 4.8 + 20);
    case 'Warrior':
      return Math.floor(common / 2.5 + 10);
    default:
      return Math.floor(common / 2.5 + 5);
  }
}
