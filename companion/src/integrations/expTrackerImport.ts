// Reading the files the Maple EXP Tracker (a separate Windows overlay) saves: its session log and the buy/sell
// offers it reads from the game's chat. Accepts the raw files in its data folder (session_log.json,
// market_log.json) and its CSV exports. Pure: text in, records out. Nothing here touches the game.

import type { SavedSession } from '../models/types';
import { matchMapName } from './statusBar';

export const TRACKER_SOURCE = 'maple-exp-tracker' as const;

/** One buy/sell offer seen in the game's chat. Prices are what players ask or bid, not what sold. */
export interface ChatOffer {
  /** First seen, "YYYY-MM-DD HH:MM:SS" local time (the tracker's own id, plus "#2" etc. for ties). */
  id: string;
  /** Last seen, same format when known. */
  lastSeen?: string;
  count: number;
  side: 'B' | 'S';
  player: string;
  /** The item as written (or the tracker's watch-list name for it). */
  item: string;
  /** Mesos, or null for PMO / no price. */
  price: number | null;
  pmo: boolean;
  each: boolean;
  raw: string;
}

export interface TrackerImport {
  sessions: SavedSession[];
  offers: ChatOffer[];
  /** Lines that couldn't be read, with why. */
  skipped: number;
  kind: 'sessions' | 'offers' | 'unknown';
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};
/** The tracker's CSV writes text starting with = + - @ with a leading ' so spreadsheets don't run it. */
const text = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s;
};
/** "2026-11-09 18:04:12" (local) → ISO string; null if it isn't that shape. */
export function localStampToIso(stamp: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(stamp.trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Minimal CSV (quotes, doubled quotes, commas and newlines in quotes, a BOM). */
export function parseCsv(input: string): string[][] {
  const s = input.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') (cell += '"'), i++;
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') row.push(cell), (cell = '');
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

interface RawSession {
  id?: unknown; map?: unknown; level_start?: unknown; level_end?: unknown; seconds?: unknown; exp?: unknown;
  exp_per_hr?: unknown; mesos?: unknown; mesos_per_hr?: unknown; levelups?: unknown;
}

function toSession(r: RawSession, maps: { id: number; name: string; street: string }[]): SavedSession | null {
  const started = text(r.id);
  const at = localStampToIso(started);
  const seconds = num(r.seconds);
  const exp = num(r.exp);
  const level = num(r.level_start) ?? num(r.level_end);
  if (!at || seconds == null || seconds <= 0 || exp == null || exp < 0 || level == null) return null;
  const minutes = seconds / 60;
  const mapName = text(r.map).trim();
  const map = mapName ? matchMapName(mapName, maps) : null;
  const perMin = exp / minutes;
  return {
    id: `${TRACKER_SOURCE}:${started}`,
    at,
    mapId: map?.id ?? null,
    level: Math.round(level),
    // The tracker stops its clock when no EXP comes in, so all of its time is hunting time.
    minutes,
    activeMinutes: minutes,
    expGained: Math.round(exp),
    expPerMin: perMin,
    expPerActiveMin: perMin,
    kills: 0,
    expPerKill: null,
    castsPerKill: null,
    mpPerMin: 0,
    potions: 0,
    source: TRACKER_SOURCE,
    mapName: mapName || undefined,
    mesosGained: num(r.mesos),
    mesosPerHour: num(r.mesos_per_hr),
  };
}

const sideOf = (v: unknown): 'B' | 'S' | null => {
  const s = text(v).trim().toUpperCase();
  if (s === 'B' || s.startsWith('BUY')) return 'B';
  if (s === 'S' || s.startsWith('SELL')) return 'S';
  return null;
};

interface RawOffer {
  id?: unknown; last?: unknown; count?: unknown; side?: unknown; name?: unknown; item?: unknown; item_text?: unknown;
  price?: unknown; pmo?: unknown; each?: unknown; raw?: unknown;
}

function toOffer(r: RawOffer): ChatOffer | null {
  const id = text(r.id).trim();
  const side = sideOf(r.side);
  const item = text(r.item || r.item_text).trim();
  if (!localStampToIso(id) || !side || !item) return null;
  const last = text(r.last).trim();
  const yes = (v: unknown) => v === true || /^(yes|true|1)$/i.test(text(v).trim());
  return {
    id,
    // The tracker keeps only the time of the last sighting ("18:22:05"); it's on the first day or the next.
    lastSeen: /^\d{2}:\d{2}:\d{2}$/.test(last) ? `${id.slice(0, 10)} ${last}` : localStampToIso(last) ? last : undefined,
    count: Math.max(1, Math.round(num(r.count) ?? 1)),
    side,
    player: text(r.name).trim(),
    item,
    price: num(r.price),
    pmo: yes(r.pmo),
    each: yes(r.each),
    raw: text(r.raw),
  };
}

const SESSION_CSV = ['started', 'map', 'level_start', 'level_end', 'minutes', 'exp_gained', 'exp_per_hr'];
const OFFER_CSV = ['first seen', 'last seen', 'times seen', 'side', 'player', 'item', 'price'];

/** Reads one file from the tracker. `maps` is used to link a session's map name to the app's maps. */
export function parseTrackerFile(content: string, maps: { id: number; name: string; street: string }[]): TrackerImport {
  const t = content.replace(/^﻿/, '').trim();
  const out: TrackerImport = { sessions: [], offers: [], skipped: 0, kind: 'unknown' };
  const take = <R, T>(rows: R[], f: (r: R) => T | null, into: T[]) => {
    for (const r of rows) {
      const v = f(r);
      if (v) into.push(v);
      else out.skipped++;
    }
  };
  if (t.startsWith('[')) {
    let data: unknown;
    try {
      data = JSON.parse(t);
    } catch {
      return out;
    }
    if (!Array.isArray(data)) return out;
    const rows = data.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');
    if (rows.some((x) => 'side' in x)) {
      out.kind = 'offers';
      take(rows as RawOffer[], toOffer, out.offers);
    } else if (rows.some((x) => 'exp' in x && 'seconds' in x)) {
      out.kind = 'sessions';
      take(rows as RawSession[], (r) => toSession(r, maps), out.sessions);
    }
    return out;
  }
  const rows = parseCsv(t);
  if (!rows.length) return out;
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  if (SESSION_CSV.every((h) => head.includes(h))) {
    out.kind = 'sessions';
    take(rows.slice(1), (r) => {
      const minutes = num(r[col('minutes')]);
      return toSession({
        id: r[col('started')], map: r[col('map')], level_start: r[col('level_start')], level_end: r[col('level_end')],
        seconds: minutes == null ? null : minutes * 60, exp: r[col('exp_gained')], mesos: r[col('mesos_gained')], mesos_per_hr: r[col('mesos_per_hr')],
      }, maps);
    }, out.sessions);
  } else if (OFFER_CSV.every((h) => head.includes(h))) {
    out.kind = 'offers';
    take(rows.slice(1), (r) => toOffer({
      id: r[col('first seen')], last: r[col('last seen')], count: r[col('times seen')], side: r[col('side')], name: r[col('player')],
      item: r[col('item')], price: r[col('price (number)')], pmo: r[col('pmo')], each: r[col('each')], raw: r[col('message')],
    }), out.offers);
  }
  return out;
}

/** Adds new sessions to a list, skipping ones already imported (same start time). */
export function mergeSessions(existing: SavedSession[], incoming: SavedSession[]): { sessions: SavedSession[]; added: number } {
  const have = new Set(existing.map((s) => s.id));
  const fresh = incoming.filter((s) => !have.has(s.id));
  return { sessions: [...fresh, ...existing], added: fresh.length };
}

/** Adds offers, updating ones already imported (the tracker raises `count` and `lastSeen` as an offer repeats). */
export function mergeOffers(existing: ChatOffer[], incoming: ChatOffer[]): { offers: ChatOffer[]; added: number } {
  const key = (o: ChatOffer) => `${o.id}|${o.player.toLowerCase()}|${o.side}|${o.item.toLowerCase()}`;
  const byKey = new Map(existing.map((o) => [key(o), o]));
  let added = 0;
  for (const o of incoming) {
    const k = key(o);
    const old = byKey.get(k);
    if (!old) added++;
    byKey.set(k, old ? { ...old, ...o, count: Math.max(old.count, o.count) } : o);
  }
  return { offers: [...byKey.values()].sort((a, b) => a.id.localeCompare(b.id)), added };
}
