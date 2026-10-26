import type { JobId } from '../models/types';

// SP build orders. ALL of these are PROPOSED builds written for this app from the
// Classic World skill data (caps/prerequisites are verified game data, the ORDER is
// opinion). Each step raises one skill to `to`. Tests check every build against caps,
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
  status: 'proposed';
  summary: string;
  steps: BuildStep[];
}

export const BUILDS: Build[] = [
  {
    id: 'mage1-claw-mp',
    name: 'Magic Claw first, then MP',
    jobs: ['magician', 'wizard_fp', 'wizard_il', 'cleric'],
    tier: 1,
    status: 'proposed',
    summary: 'Max the 2-hit Magic Claw early, then Magic Guard for survival, then MP passives. Uses exactly 61 SP.',
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
    id: 'mage1-claw-armor',
    name: 'Magic Claw first, then Magic Armor',
    jobs: ['magician', 'wizard_fp', 'wizard_il', 'cleric'],
    tier: 1,
    status: 'proposed',
    summary: 'Alternative: trades Max MP Increase for Magic Armor (+120 W/M DEF). Uses exactly 61 SP.',
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
