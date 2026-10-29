import type { JobId, SourceMeta } from '../models/types';
import { SOURCES } from './sources';

// SP build orders. Builds with a `source` copy a Classic World community guide; the rest
// are PROPOSED builds written for this app from the Classic World skill data
// (caps/prerequisites are verified game data, the ORDER is opinion). Sourced builds come
// first, so they are the default. Each step raises one skill to `to`. Tests check every build against caps,
// prerequisites and SP totals.

export interface BuildStep {
  skillId: number;
  to: number;
  why?: string;
}

export interface Build {
  id: string;
  name: string;
  jobs: JobId[]; // jobs this build applies to
  tier: 1 | 2;
  status: 'proposed' | 'community_reported';
  /** The guide a community build is copied from. */
  source?: SourceMeta;
  summary: string;
  steps: BuildStep[];
}

export const BUILDS: Build[] = [
  {
    id: 'mage1-meow-claw',
    name: 'MeowDB: Magic Claw, Magic Guard 3, Magic Armor',
    jobs: ['magician', 'wizard_fp', 'wizard_il', 'cleric'],
    tier: 1,
    status: 'community_reported',
    source: SOURCES.meowMage,
    summary: "MeowDB's starting plan: Magic Claw to 20, MP Recovery to 15, Magic Guard only to 3, the rest into Magic Armor. Uses exactly 61 SP.",
    steps: [
      { skillId: 2001002, to: 1, why: 'Energy Bolt 1: needed for Magic Claw.' },
      { skillId: 2001003, to: 2 },
      { skillId: 2000000, to: 1 },
      { skillId: 2001003, to: 20, why: 'Magic Claw: 2 hits per cast.' },
      { skillId: 2000000, to: 12, why: 'Improved MP Recovery: fewer potions.' },
      { skillId: 2001000, to: 1, why: 'Magic Guard 1 in time for King Slime in KPQ.' },
      { skillId: 2000000, to: 15 },
      { skillId: 2001000, to: 3, why: '"Magic Guard 3 is all you need."' },
      { skillId: 2001001, to: 20, why: 'Magic Armor: Weapon and Magic DEF.' },
      { skillId: 2000001, to: 2, why: 'Max MP Increase with the last points.' },
    ],
  },
  {
    id: 'mage1-meow-bolt',
    name: 'MeowDB: Energy Bolt, Magic Guard 3, Magic Armor',
    jobs: ['magician', 'wizard_fp', 'wizard_il', 'cleric'],
    tier: 1,
    status: 'community_reported',
    source: SOURCES.meowMage,
    summary: "MeowDB's Energy Bolt plan: Energy Bolt to 20, MP Recovery to 15, Magic Guard only to 3, the rest into Magic Armor. Uses exactly 61 SP.",
    steps: [
      { skillId: 2001002, to: 20, why: 'Energy Bolt: your main attack.' },
      { skillId: 2000000, to: 15, why: 'Improved MP Recovery: fewer potions.' },
      { skillId: 2001000, to: 3, why: '"Magic Guard 3 is all you need."' },
      { skillId: 2001001, to: 20, why: 'Magic Armor: Weapon and Magic DEF.' },
      { skillId: 2000001, to: 3, why: 'Max MP Increase with the last points.' },
    ],
  },
  {
    id: 'mage1-claw-mp',
    name: 'Magic Claw first, then MP',
    jobs: ['magician', 'wizard_fp', 'wizard_il', 'cleric'],
    tier: 1,
    status: 'proposed',
    summary: 'Max the 2-hit Magic Claw early, then Magic Guard for survival, then MP passives. Uses exactly 61 SP. MeowDB disagrees: it says Magic Guard 3 is all you need.',
    steps: [
      { skillId: 2001002, to: 1, why: 'Prerequisite for Magic Claw (Energy Bolt Lv 1).' },
      { skillId: 2001003, to: 20, why: 'Magic Claw: 2 hits per cast, best 1st-job damage per MP.' },
      { skillId: 2001000, to: 15, why: 'Magic Guard: up to 80% of damage taken from MP.' },
      { skillId: 2000000, to: 3, why: 'Prerequisite for Max MP Increase.' },
      { skillId: 2000001, to: 15, why: 'Max MP Increase: up to +25% Max MP.' },
      { skillId: 2000000, to: 10, why: 'Improved MP Recovery: more MP from potions.' },
    ],
  },
  {
    id: 'mage1-bolt-mp',
    name: 'Energy Bolt first, then MP',
    jobs: ['magician', 'wizard_fp', 'wizard_il', 'cleric'],
    tier: 1,
    status: 'proposed',
    summary: 'For Energy Bolt users: max the single-target Energy Bolt, then Magic Guard, then MP passives, with 1 point in Magic Claw. Uses exactly 61 SP. MeowDB disagrees: it says Magic Guard 3 is all you need.',
    steps: [
      { skillId: 2001002, to: 20, why: 'Energy Bolt: your main attack.' },
      { skillId: 2001000, to: 15, why: 'Magic Guard: up to 80% of damage taken from MP.' },
      { skillId: 2000000, to: 3, why: 'Prerequisite for Max MP Increase.' },
      { skillId: 2000001, to: 15, why: 'Max MP Increase: up to +25% Max MP.' },
      { skillId: 2000000, to: 10, why: 'Improved MP Recovery: more MP from potions.' },
      { skillId: 2001003, to: 1, why: 'Magic Claw Lv 1, kept as a backup attack.' },
    ],
  },
  {
    id: 'mage1-claw-armor',
    name: 'Magic Claw first, then Magic Armor',
    jobs: ['magician', 'wizard_fp', 'wizard_il', 'cleric'],
    tier: 1,
    status: 'proposed',
    summary: 'Alternative: trades Max MP Increase for Magic Armor (+120 W/M DEF). Uses exactly 61 SP. MeowDB disagrees: it says Magic Guard 3 is all you need.',
    steps: [
      { skillId: 2001002, to: 1 },
      { skillId: 2001003, to: 20 },
      { skillId: 2001000, to: 15 },
      { skillId: 2001001, to: 20, why: 'Magic Armor: +40 to +120 Weapon/Magic DEF.' },
      { skillId: 2000000, to: 5 },
    ],
  },
  {
    id: 'thief1-l7-range',
    name: 'Lucky Seven, then range and avoid',
    jobs: ['thief', 'assassin'],
    tier: 1,
    status: 'proposed',
    summary: 'Max Lucky Seven (2 stars per cast, LUK-based), then Keen Eyes range and Nimble Body. Uses exactly 61 SP.',
    steps: [
      { skillId: 4001003, to: 20, why: 'Lucky Seven: main attack, 2 stars per cast, uses LUK.' },
      { skillId: 4000000, to: 3, why: 'Prerequisite for Keen Eyes.' },
      { skillId: 4000001, to: 15, why: 'Keen Eyes: +200 range for stars.' },
      { skillId: 4000000, to: 15, why: 'Nimble Body: +15 accuracy and evasion.' },
      { skillId: 4001000, to: 3, why: 'Prerequisite for Dark Sight.' },
      { skillId: 4001001, to: 8 },
    ],
  },
  {
    id: 'thief1-l7-darksight',
    name: 'Lucky Seven, then Dark Sight',
    jobs: ['thief', 'assassin'],
    tier: 1,
    status: 'proposed',
    summary: 'Alternative: maxes Dark Sight instead of Keen Eyes. Uses exactly 61 SP.',
    steps: [
      { skillId: 4001003, to: 20 },
      { skillId: 4000000, to: 15 },
      { skillId: 4001000, to: 3 },
      { skillId: 4001001, to: 20 },
      { skillId: 4000001, to: 3 },
    ],
  },
  {
    id: 'thief1-ds-darksight',
    name: 'Double Stab, then Dark Sight',
    jobs: ['thief', 'bandit'],
    tier: 1,
    status: 'proposed',
    summary: 'For dagger thieves heading to Bandit: max the melee Double Stab, then Nimble Body and Dark Sight. Uses exactly 61 SP.',
    steps: [
      { skillId: 4001002, to: 20, why: 'Double Stab: your main attack (2 dagger hits).' },
      { skillId: 4000000, to: 15, why: 'Nimble Body: +15 accuracy and evasion.' },
      { skillId: 4001000, to: 3, why: 'Prerequisite for Dark Sight.' },
      { skillId: 4001001, to: 20, why: 'Dark Sight: escape when overwhelmed.' },
      { skillId: 4000001, to: 3 },
    ],
  },
  {
    id: 'cleric-holy-arrow-first',
    name: 'Cleric: Holy Arrow first',
    jobs: ['cleric'],
    tier: 2,
    status: 'proposed',
    summary: 'Holy Arrow as the main single-target attack, then the Heal / Invincible / Bless line.',
    steps: [
      { skillId: 2301004, to: 30, why: 'Holy Arrow: main attack, strong vs undead.' },
      { skillId: 2301001, to: 5, why: 'Prerequisite for Invincible.' },
      { skillId: 2301002, to: 5, why: 'Prerequisite for Bless.' },
      { skillId: 2301003, to: 20, why: 'Bless: party accuracy, avoid and defense.' },
      { skillId: 2301001, to: 30, why: 'Heal: party healing; damages undead.' },
      { skillId: 2301000, to: 20 },
      { skillId: 2300000, to: 20 },
      { skillId: 2301002, to: 20 },
    ],
  },
  {
    id: 'cleric-heal-first',
    name: 'Cleric: Heal first',
    jobs: ['cleric'],
    tier: 2,
    status: 'proposed',
    summary: 'Alternative for party play and undead maps: Heal first, then Holy Arrow.',
    steps: [
      { skillId: 2301001, to: 30, why: 'Heal: party healing; hits several undead at once.' },
      { skillId: 2301004, to: 30 },
      { skillId: 2301002, to: 5 },
      { skillId: 2301003, to: 20 },
      { skillId: 2301000, to: 20 },
      { skillId: 2300000, to: 20 },
      { skillId: 2301002, to: 20 },
    ],
  },
  {
    id: 'assassin-standard',
    name: 'Assassin: mastery, crits, speed, Drain',
    jobs: ['assassin'],
    tier: 2,
    status: 'proposed',
    summary: 'Claw Mastery and Critical Throw first for damage, then Claw Booster speed, then Drain and utility.',
    steps: [
      { skillId: 4100000, to: 20, why: 'Claw Mastery: mastery 10, +20 ATT, star recovery.' },
      { skillId: 4100001, to: 30, why: 'Critical Throw: +15% crit rate, +35% crit damage.' },
      { skillId: 4101000, to: 20, why: 'Claw Booster: faster attacks (needs Claw Mastery 5).' },
      { skillId: 4101001, to: 10, why: 'Haste: movement while hunting.' },
      { skillId: 4100002, to: 3, why: 'Prerequisite for Drain.' },
      { skillId: 4101002, to: 30, why: 'Drain: 180-240% attack that heals.' },
      { skillId: 4101001, to: 20 },
      { skillId: 4100002, to: 20 },
    ],
  },
  {
    id: 'il-thunder-first',
    name: 'I/L: Thunder Bolt first',
    jobs: ['wizard_il'],
    tier: 2,
    status: 'proposed',
    summary: 'Thunder Bolt hits up to 6 monsters, so it is maxed first for mobbing; Meditation next.',
    steps: [
      { skillId: 2201004, to: 30, why: 'Thunder Bolt: 6 targets.' },
      { skillId: 2200000, to: 3, why: 'Prerequisite for Meditation.' },
      { skillId: 2201000, to: 20, why: 'Meditation: +25 M.ATT party buff.' },
      { skillId: 2201003, to: 30, why: 'Cold Beam: single-target damage + freeze.' },
      { skillId: 2201001, to: 20 },
      { skillId: 2201002, to: 20 },
      { skillId: 2200000, to: 20 },
    ],
  },
  {
    id: 'il-coldbeam-first',
    name: 'I/L: Cold Beam first',
    jobs: ['wizard_il'],
    tier: 2,
    status: 'proposed',
    summary: 'Alternative for single-target maps (e.g. low spawn density): Cold Beam before Thunder Bolt.',
    steps: [
      { skillId: 2201003, to: 30 },
      { skillId: 2200000, to: 3 },
      { skillId: 2201000, to: 20 },
      { skillId: 2201004, to: 30 },
      { skillId: 2201001, to: 20 },
      { skillId: 2201002, to: 20 },
      { skillId: 2200000, to: 20 },
    ],
  },
  {
    id: 'fp-poison-first',
    name: 'F/P: Poison Breath first',
    jobs: ['wizard_fp'],
    tier: 2,
    status: 'proposed',
    summary: 'Poison Breath explodes on up to 6 targets, so it is maxed first; Fire Arrow for single targets.',
    steps: [
      { skillId: 2101004, to: 30, why: 'Poison Breath: explosion hits 6 nearby targets.' },
      { skillId: 2100000, to: 3 },
      { skillId: 2101000, to: 20, why: 'Meditation: +25 M.ATT party buff.' },
      { skillId: 2101003, to: 30, why: 'Fire Arrow: strong single-target + burn.' },
      { skillId: 2101001, to: 20 },
      { skillId: 2101002, to: 20 },
      { skillId: 2100000, to: 20 },
    ],
  },
  {
    id: 'fp-fire-first',
    name: 'F/P: Fire Arrow first',
    jobs: ['wizard_fp'],
    tier: 2,
    status: 'proposed',
    summary: 'Alternative: single-target Fire Arrow first (good vs fire-weak monsters), then Poison Breath.',
    steps: [
      { skillId: 2101003, to: 30 },
      { skillId: 2100000, to: 3 },
      { skillId: 2101000, to: 20 },
      { skillId: 2101004, to: 30 },
      { skillId: 2101001, to: 20 },
      { skillId: 2101002, to: 20 },
      { skillId: 2100000, to: 20 },
    ],
  },
];

export const buildById = new Map(BUILDS.map((b) => [b.id, b]));
export const buildsFor = (job: JobId, tier: 1 | 2) => BUILDS.filter((b) => b.tier === tier && b.jobs.includes(job));
