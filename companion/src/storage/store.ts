// Local persistence (localStorage) + JSON import/export. No backend.

import { useSyncExternalStore } from 'react';
import type { AppState, Character, JobId, TrainingAssumptions } from '../models/types';

const KEY = 'mcw-companion:v1';

export const DEFAULT_ASSUMPTIONS: TrainingAssumptions = {
  castsPerSecond: 1.1,
  uptime: 0.7,
  respawnSeconds: 8,
  spawnShare: 0.6,
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
    base: mage ? { str: 4, dex: 4, int: 57, luk: 5 } : thief ? { str: 4, dex: 25, int: 4, luk: 37 } : { str: 47, dex: 15, int: 4, luk: 4 },
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
    mainSkillId: mage ? 2001003 : thief ? 4001003 : null,
    observations: [],
    favorites: [],
    completedQuests: [],
    updatedAt: new Date().toISOString(),
  };
}

function defaultState(): AppState {
  return { version: 1, characters: [], settings: { activeCharacterId: null, assumptions: { ...DEFAULT_ASSUMPTIONS }, recentMonsters: [] } };
}

/** Fill in fields added after the data was saved, and drop anything malformed. */
export function migrate(raw: unknown): AppState {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppState>;
  const chars = Array.isArray(r.characters) ? r.characters : [];
  const template = newCharacter();
  const characters = chars
    .filter((c): c is Character => !!c && typeof c === 'object' && typeof (c as Character).id === 'string')
    .map((c) => ({ ...template, ...c, base: { ...template.base, ...c.base }, equip: { ...template.equip, ...c.equip }, statGoals: c.statGoals ?? {}, observations: c.observations ?? [], skills: c.skills ?? {} }));
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
    const updated = { ...c, updatedAt: new Date().toISOString() };
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
