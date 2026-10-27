// Local persistence (localStorage) + JSON import/export. No backend.

import { useSyncExternalStore } from 'react';
import type { AppState, Character, JobId, TrainingAssumptions } from '../models/types';
import { expectedBase } from '../calculators/ap';
import { applyPlan } from '../calculators/choose';
import { expForLevel } from '../data/expTable';

const KEY = 'mcw-companion:v1';

export const DEFAULT_ASSUMPTIONS: TrainingAssumptions = {
  castsPerSecond: 1.1,
  uptime: 0.7,
  respawnSeconds: 8,
  spawnShare: 0.6,
  laneSpawnShare: 0.9,
  mobsPerCast: null,
  packSize: 3,
  sessionMinutes: 60,
  travelMinutes: 3,
  deathsPerHour: 0,
  deathExpLossPct: 10,
  mpPotionMp: 100,
  mpPotionPrice: 200,
  hpPotionHpPerMin: 0,
  hpPotionHp: 50,
  hpPotionPrice: 50,
  starRechargePricePerStar: 1,
  adjustForDefense: true,
  adjustForElement: false,
  adjustForLevelGap: true,
  adjustForAccuracy: true,
  elementModel: 'meowdb',
};

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function newCharacter(job: JobId = 'magician', name = 'New character'): Character {
  const mage = job === 'magician' || job.startsWith('wizard') || job === 'cleric';
  const thief = job === 'thief' || job === 'assassin' || job === 'bandit';
  return {
    id: uid(),
    name,
    job,
    level: 10,
    base: expectedBase(job, 10),
    currentExp: 0,
    equip: { str: 0, dex: 0, int: 0, luk: 0 },
    hp: 0,
    mp: 0,
    weapon: '',
    weaponAttack: thief ? 10 : 0,
    magicAttack: mage ? 20 : 0,
    throwingStar: thief ? '' : '',
    starAttack: thief ? 15 : 0,
    skills: {},
    statGoals: {},
    mainSkillId: null, // auto: highest-level attack skill
    followPlan: true,
    observations: [],
    favorites: [],
    completedQuests: [],
    updatedAt: new Date().toISOString(),
  };
}

function defaultState(): AppState {
  return { version: 1, characters: [], settings: { activeCharacterId: null, assumptions: { ...DEFAULT_ASSUMPTIONS }, recentMonsters: [] } };
}

// Versions before 2026-10-27 pre-set Magic Claw / Lucky Seven as every character's main
// attack. If another skill is levelled higher, that was never the player's choice.
const OLD_DEFAULT_MAIN = new Set([2001003, 4001003]);
const outlevelled = (c: Character) =>
  Object.entries(c.skills).some(([id, lv]) => Number(id) !== c.mainSkillId && lv > (c.skills[c.mainSkillId ?? 0] ?? 0) && ATTACK_IDS.has(Number(id)));
const ATTACK_IDS = new Set([2001002, 2001003, 4001003]);

/** Fill in fields added after the data was saved, and drop anything malformed. */
export function migrate(raw: unknown): AppState {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppState>;
  const chars = Array.isArray(r.characters) ? r.characters : [];
  const template = newCharacter();
  const characters = chars
    .filter((c): c is Character => !!c && typeof c === 'object' && typeof (c as Character).id === 'string')
    .map((c) => ({ ...template, ...c, base: { ...template.base, ...c.base }, equip: { ...template.equip, ...c.equip }, statGoals: c.statGoals ?? {}, observations: c.observations ?? [], skills: c.skills ?? {}, followPlan: c.followPlan ?? false }))
    .map(({ expToNext, ...c }) => ({ ...c, currentExp: expToNext ? Math.max(0, expForLevel(c.level) - expToNext) : c.currentExp ?? 0 }))
    .map((c) => (OLD_DEFAULT_MAIN.has(c.mainSkillId ?? 0) && outlevelled(c) ? { ...c, mainSkillId: null } : c));
  const settings = { ...base.settings, ...(r.settings ?? {}) };
  settings.assumptions = { ...DEFAULT_ASSUMPTIONS, ...(r.settings?.assumptions ?? {}) };
  if (!characters.some((c) => c.id === settings.activeCharacterId)) settings.activeCharacterId = characters[0]?.id ?? null;
  return { version: 1, characters, settings };
}

function load(): AppState {
  try {
    const s = localStorage.getItem(KEY);
    return migrate(s ? JSON.parse(s) : null);
  } catch {
    return defaultState();
  }
}

let state: AppState = typeof localStorage === 'undefined' ? defaultState() : load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

export function setState(update: (s: AppState) => AppState) {
  state = update(state);
  persist();
  listeners.forEach((l) => l());
}

export function getState() {
  return state;
}

export function useAppState(): AppState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

// ---------- convenience actions ----------

export function upsertCharacter(c: Character) {
  setState((s) => {
    const updated = { ...applyPlan(c), updatedAt: new Date().toISOString() };
    const exists = s.characters.some((x) => x.id === c.id);
    return {
      ...s,
      characters: exists ? s.characters.map((x) => (x.id === c.id ? updated : x)) : [...s.characters, updated],
      settings: exists ? s.settings : { ...s.settings, activeCharacterId: c.id },
    };
  });
}

export function deleteCharacter(id: string) {
  setState((s) => {
    const characters = s.characters.filter((c) => c.id !== id);
    const active = s.settings.activeCharacterId === id ? characters[0]?.id ?? null : s.settings.activeCharacterId;
    return { ...s, characters, settings: { ...s.settings, activeCharacterId: active } };
  });
}

export function setActive(id: string) {
  setState((s) => ({ ...s, settings: { ...s.settings, activeCharacterId: id } }));
}

export function setAssumptions(a: Partial<TrainingAssumptions>) {
  setState((s) => ({ ...s, settings: { ...s.settings, assumptions: { ...s.settings.assumptions, ...a } } }));
}

export function touchRecentMonster(id: number) {
  setState((s) => ({ ...s, settings: { ...s.settings, recentMonsters: [id, ...s.settings.recentMonsters.filter((x) => x !== id)].slice(0, 8) } }));
}

export function newObservationId() {
  return uid();
}

export function exportJson(): string {
  return JSON.stringify({ app: 'mcw-companion', exportedAt: new Date().toISOString(), ...state }, null, 2);
}

/** Replace all local data with an export. Throws on invalid input. */
export function importJson(text: string): AppState {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.characters)) throw new Error('Not a companion export (no characters array).');
  const next = migrate(parsed);
  setState(() => next);
  return next;
}

// ---------- share links ----------
// A character travels inside the link's #fragment, which browsers never send to the server.

const toB64Url = (text: string) => {
  let bin = '';
  for (const b of new TextEncoder().encode(text)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64Url = (b64: string) => {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
};

export function encodeCharacter(c: Character): string {
  return toB64Url(JSON.stringify(c));
}

/** Decode a shared character; it goes through migrate() so old or partial data is filled in. */
export function decodeCharacter(code: string): Character {
  const raw = JSON.parse(fromB64Url(code));
  const c = migrate({ characters: [raw] }).characters[0];
  if (!c) throw new Error('This link does not contain a character.');
  return c;
}
