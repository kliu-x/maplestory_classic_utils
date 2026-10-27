import type { JobId, JobInfo, SourceMeta } from '../models/types';
import { SOURCES } from './sources';

// Classic World progression rules. Each rule carries its own source so the UI can
// show which ones are official and which are community-reported.

export interface Rule<T> {
  value: T;
  source: SourceMeta;
}

export const RULES = {
  maxLevel: { value: 100, source: SOURCES.launchNotes } as Rule<number>,
  firstJobLevel: { value: 10, source: SOURCES.launchNotes } as Rule<number>,
  secondJobLevel: { value: 30, source: SOURCES.launchNotes } as Rule<number>,
  thirdJobAvailable: {
    value: false,
    source: { ...SOURCES.cot2Notes, notes: 'Lv 70 3rd job existed in COT2; launch notes list only 1st/2nd job.' },
  } as Rule<boolean>,
  // SP: 1/level from Lv 2-10 for Beginner skills, 3/level from Lv 11, 61 1st-job SP by Lv 30
  // (= 1 at advancement + 3 x 20 levels). 2nd-job SP cannot go into 1st-job skills.
  beginnerSpPerLevel: { value: 1, source: SOURCES.meowBeginner } as Rule<number>,
  spPerLevel: { value: 3, source: SOURCES.meowBeginner } as Rule<number>,
  spAtAdvancement: {
    value: 1,
    source: { ...SOURCES.meowMage, notes: 'Inferred from "61 SP by Lv 30" (1 + 3 x 20). The same +1 is assumed at 2nd job; unverified.' },
  } as Rule<number>,
  apPerLevel: { value: 5, source: SOURCES.meowBeginner } as Rule<number>,
};

export const JOBS: Record<JobId, JobInfo> = {
  beginner: { id: 'beginner', label: 'Beginner', family: 'Beginner', tier: 0, gameJobIds: [0], primaryStat: 'str', damageType: 'physical', plannerSupported: false },
  magician: { id: 'magician', label: 'Magician', family: 'Magician', tier: 1, gameJobIds: [200], primaryStat: 'int', secondaryStat: 'luk', damageType: 'magic', plannerSupported: true },
  wizard_fp: { id: 'wizard_fp', label: 'Wizard (Fire/Poison)', family: 'Magician', tier: 2, gameJobIds: [200, 210], primaryStat: 'int', secondaryStat: 'luk', damageType: 'magic', plannerSupported: true },
  wizard_il: { id: 'wizard_il', label: 'Wizard (Ice/Lightning)', family: 'Magician', tier: 2, gameJobIds: [200, 220], primaryStat: 'int', secondaryStat: 'luk', damageType: 'magic', plannerSupported: true },
  cleric: { id: 'cleric', label: 'Cleric', family: 'Magician', tier: 2, gameJobIds: [200, 230], primaryStat: 'int', secondaryStat: 'luk', damageType: 'magic', plannerSupported: true },
  thief: { id: 'thief', label: 'Thief', family: 'Thief', tier: 1, gameJobIds: [400], primaryStat: 'luk', secondaryStat: 'dex', damageType: 'physical', plannerSupported: true },
  assassin: { id: 'assassin', label: 'Assassin', family: 'Thief', tier: 2, gameJobIds: [400, 410], primaryStat: 'luk', secondaryStat: 'dex', damageType: 'physical', plannerSupported: true },
  bandit: { id: 'bandit', label: 'Bandit', family: 'Thief', tier: 2, gameJobIds: [400, 420], primaryStat: 'luk', secondaryStat: 'dex', damageType: 'physical', plannerSupported: false },
  swordsman: { id: 'swordsman', label: 'Swordsman', family: 'Warrior', tier: 1, gameJobIds: [100], primaryStat: 'str', secondaryStat: 'dex', damageType: 'physical', plannerSupported: false },
  archer: { id: 'archer', label: 'Archer', family: 'Bowman', tier: 1, gameJobIds: [300], primaryStat: 'dex', secondaryStat: 'str', damageType: 'physical', plannerSupported: false },
  pirate: { id: 'pirate', label: 'Pirate', family: 'Pirate', tier: 1, gameJobIds: [500], primaryStat: 'str', secondaryStat: 'dex', damageType: 'physical', plannerSupported: false },
};

/** Which skillbook a skill id belongs to (Classic World uses jobId * 10000 + n). */
export const skillJobId = (skillId: number) => Math.floor(skillId / 10000);
export const jobTierOfGameJob = (gameJobId: number) => (gameJobId === 0 ? 0 : gameJobId % 100 === 0 ? 1 : 2);
