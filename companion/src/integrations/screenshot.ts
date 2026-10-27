// Turn OCR text from an in-game screenshot (Character Stat + Skill windows) into profile
// fields, and look up level/job by name on ClassicRank. Pure parsing is separate from the
// OCR call so it can be unit-tested.

import type { Character, JobId, Skill, StatKey } from '../models/types';
import { JOBS } from '../data/rules';

export interface ParsedScreenshot {
  name?: string;
  job?: JobId;
  level?: number;
  hp?: number;
  mp?: number;
  currentExp?: number;
  base: Partial<Record<StatKey, number>>;
  equip: Partial<Record<StatKey, number>>;
  skills: Record<number, number>;
}

const STAT_KEYS: StatKey[] = ['str', 'dex', 'int', 'luk'];
const num = (s: string) => Number(s.replace(/[,.\s]/g, ''));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Map a job name as the game or ClassicRank writes it ("MAGICIAN", "Wizard (Fire/Poison)", "Spearman") to a JobId. */
export function jobFromName(raw: string): JobId | undefined {
  const n = norm(raw);
  if (!n) return undefined;
  const exact = (Object.keys(JOBS) as JobId[]).find((j) => norm(JOBS[j].label) === n);
  if (exact) return exact;
  if (n.includes('firepoison') || n === 'wizardfp') return 'wizard_fp';
  if (n.includes('icelightning') || n === 'wizardil') return 'wizard_il';
  const families: [RegExp, JobId][] = [
    [/^(magician|mage)/, 'magician'],
    [/^cleric/, 'cleric'],
    [/^assassin/, 'assassin'],
    [/^bandit/, 'bandit'],
    [/^(thief|rogue)/, 'thief'],
    [/^(swordsman|warrior|fighter|page|spearman)/, 'swordsman'],
    [/^(archer|bowman|hunter|crossbowman)/, 'archer'],
    [/^(pirate|brawler|gunslinger)/, 'pirate'],
    [/^beginner/, 'beginner'],
  ];
  return families.find(([re]) => re.test(n))?.[1];
}

/**
 * "(127+7)" next to a total of 134 -> [127, 7]. OCR often reads the "+" as 4 or t
 * ("12747"), so any split whose halves add up to the total is accepted.
 */
export function splitBonus(total: number, inner: string): [number, number] | null {
  const plain = /^\s*(\d{1,4})\s*\+\s*(\d{1,4})\s*$/.exec(inner);
  if (plain && +plain[1] + +plain[2] === total) return [+plain[1], +plain[2]];
  const s = inner.replace(/\s/g, '');
  for (let i = 1; i < s.length - 1; i++) {
    if (!/[+4tT]/.test(s[i])) continue;
    const a = s.slice(0, i), b = s.slice(i + 1);
    if (/^\d+$/.test(a) && /^\d+$/.test(b) && +a + +b === total) return [+a, +b];
  }
  return null;
}

/**
 * Read profile fields out of OCR text. Anything not found is left out, so the review
 * step only offers values that were actually read.
 */
export function parseScreenshotText(text: string, skills: Skill[]): ParsedScreenshot {
  const t = text.replace(/\r/g, '');
  const out: ParsedScreenshot = { base: {}, equip: {}, skills: {} };

  const name = /\bNAME\s*[:.]?\s*([A-Za-z0-9]{2,12})\b/i.exec(t);
  if (name) out.name = name[1];
  const job = /\bJOB\s*[:.]?\s*([A-Za-z][A-Za-z ()/]{2,30})/i.exec(t);
  if (job) out.job = jobFromName(job[1].split('\n')[0].trim());

  const level = /\bLEVEL\s*[:.]?\s*(\d{1,3})\b/i.exec(t) ?? /\bLV\.?\s*(\d{1,3})\b/i.exec(t);
  if (level && +level[1] >= 1 && +level[1] <= 200) out.level = +level[1];

  // "HP 611/611" or "HP[611/611]": the second number is max HP.
  const hp = /\bHP\s*[:.[]?\s*(\d{1,6})\s*\/\s*(\d{1,6})/i.exec(t);
  if (hp) out.hp = +hp[2];
  const mp = /\bMP\s*[:.[]?\s*(\d{1,6})\s*\/\s*(\d{1,6})/i.exec(t);
  if (mp) out.mp = +mp[2];

  // "EXP. 11152 (20%)" or "EXP 11,152[20.31%]"
  const exp = /\bEXP\.?\s*[:[]?\s*([\d,]{1,13})\s*[([]\s*\d/i.exec(t);
  if (exp) out.currentExp = num(exp[1]);

  for (const k of STAT_KEYS) {
    // Skip item tooltips ("REQ INT : 40"). "INT 134 (127+7)" gives base and equipment.
    const re = new RegExp(`(?<!REQ\\s?)\\b${k}\\s*[:.]?\\s*(\\d{1,4})(?:\\s*[({]\\s*([^)}\\n]{1,12})[)}])?`, 'gi');
    for (const m of t.matchAll(re)) {
      const split = m[2] != null ? splitBonus(+m[1], m[2]) : null;
      if (split) {
        [out.base[k], out.equip[k]] = split;
        break;
      }
      if (out.base[k] == null) {
        out.base[k] = +m[1];
        out.equip[k] = 0;
      }
    }
  }

  // The stat window's labels are white on coloured badges and often unreadable, so fall
  // back to position: values always come in the order NAME JOB LEVEL HP MP EXP FAME STR
  // DEX INT LUK, and HP/MP ("611/611") and EXP ("11152 (20%)") have distinctive shapes.
  const lines0 = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const fracs = [...t.matchAll(/(\d{1,6})\s*\/\s*(\d{1,6})/g)];
  if (out.hp == null && fracs[0]) out.hp = +fracs[0][2];
  if (out.mp == null && fracs[1]) out.mp = +fracs[1][2];
  const expLine = lines0.findIndex((l) => /^\D{0,3}[\d,]{1,13}\s*[([]\s*\d{1,3}(?:\.\d+)?\s*%/.test(l));
  if (out.currentExp == null && expLine >= 0) out.currentExp = num(/[\d,]{1,13}/.exec(lines0[expLine])![0]);
  if (out.level == null && fracs[0]) {
    const hpLine = lines0.findIndex((l) => l.includes(fracs[0][0]));
    const m = hpLine > 0 ? /^\D{0,3}(\d{1,3})\b/.exec(lines0[hpLine - 1]) : null;
    if (m && +m[1] >= 1 && +m[1] <= 200) out.level = +m[1];
  }
  if (out.job == null) {
    const word = t.match(/\b(MAGICIAN|WIZARD|CLERIC|THIEF|ASSASSIN|BANDIT|WARRIOR|SWORDSMAN|FIGHTER|PAGE|SPEARMAN|BOWMAN|ARCHER|HUNTER|CROSSBOWMAN|PIRATE|BEGINNER)\b/i);
    if (word) out.job = jobFromName(word[1]);
  }
  if (STAT_KEYS.every((k) => out.base[k] == null) && expLine >= 0) {
    // First value on each following line: FAME, STR, DEX, INT, LUK (the skill window's
    // numbers come after it on the same OCR line). Only trusted if all five are there.
    const vals: [number, number][] = [];
    const namesSkill = (l?: string) => !!l && skills.some((sk) => norm(l).includes(norm(sk.name).slice(0, 10)));
    for (let j = expLine + 1; j < lines0.length; j++) {
      const l = lines0[j];
      // A bare number under a skill name is that skill's level, not a stat.
      if (/^\d{1,2}$/.test(l) && namesSkill(lines0[j - 1])) continue;
      const m = /^[^A-Za-z0-9]{0,2}(\d{1,4})(?:\s*[({]\s*([^)}]{1,12})[)}])?/.exec(l);
      if (!m) {
        // An unreadable stat line still uses up its slot; stop rather than misalign.
        if (/^[A-Za-z]{1,3}/.test(l)) break;
        continue;
      }
      vals.push((m[2] != null && splitBonus(+m[1], m[2])) || [+m[1], 0]);
      if (vals.length === 5) break;
    }
    if (vals.length === 5) STAT_KEYS.forEach((k, i) => ([out.base[k], out.equip[k]] = vals[i + 1]));
  }

  // Skill window: the name (possibly cut off, "Improved MP Reco...") with the level on the
  // same line or one of the next two. With the stat and skill windows side by side, OCR
  // joins their rows, so the name can sit mid-line and its level at the end of the next line.
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const s of skills) {
    // First 10 letters: survives "Improved MP Reco..." and OCR slips near the end.
    const key = norm(s.name).slice(0, 10);
    const i = lines.findIndex((l) => norm(l).includes(key));
    if (i < 0) continue;
    const line = lines[i];
    const last = s.name.split(' ').pop()!.slice(0, 3).toLowerCase();
    const at = line.toLowerCase().lastIndexOf(last);
    const sameLine = at >= 0 ? /^\S*\.*\s+(\d{1,2})\b/.exec(line.slice(at)) : null;
    const lineEnd = (l?: string) => (l ? /(\d{1,2})\s*[|\]]*\s*$/.exec(l) : null);
    // A following line that names another skill belongs to that skill.
    const free = (l?: string) => (l && !skills.some((o) => o.id !== s.id && norm(l).includes(norm(o.name).slice(0, 10))) ? l : undefined);
    const n1 = free(lines[i + 1]);
    const n2 = n1 !== undefined ? free(lines[i + 2]) : undefined;
    for (const m of [sameLine, lineEnd(n1), lineEnd(n2)]) {
      if (m && +m[1] <= s.masterLevel) {
        out.skills[s.id] = +m[1];
        break;
      }
    }
  }
  return out;
}

export interface ReviewRow {
  key: string;
  label: string;
  current: string;
  found: string;
  apply: (c: Character) => Character;
}

/** Rows for the "review before saving" table: only fields that were read and differ. */
export function reviewRows(c: Character, p: ParsedScreenshot, skillName: (id: number) => string): ReviewRow[] {
  const rows: ReviewRow[] = [];
  const add = (key: string, label: string, cur: unknown, found: unknown, apply: (c: Character) => Character) => {
    if (found == null || String(cur) === String(found)) return;
    rows.push({ key, label, current: String(cur ?? '—'), found: String(found), apply });
  };
  add('name', 'Name', c.name, p.name, (x) => ({ ...x, name: p.name! }));
  add('job', 'Job', JOBS[c.job].label, p.job && JOBS[p.job].label, (x) => ({ ...x, job: p.job!, buildId: undefined }));
  add('level', 'Level', c.level, p.level, (x) => ({ ...x, level: p.level! }));
  add('exp', 'Current EXP', c.currentExp ?? 0, p.currentExp, (x) => ({ ...x, currentExp: p.currentExp! }));
  add('hp', 'Max HP', c.hp, p.hp, (x) => ({ ...x, hp: p.hp! }));
  add('mp', 'Max MP', c.mp, p.mp, (x) => ({ ...x, mp: p.mp! }));
  for (const k of STAT_KEYS) {
    add(`base.${k}`, `${k.toUpperCase()} (base)`, c.base[k], p.base[k], (x) => ({ ...x, base: { ...x.base, [k]: p.base[k]! }, followPlan: false }));
    add(`equip.${k}`, `${k.toUpperCase()} (equipment)`, c.equip[k], p.equip[k], (x) => ({ ...x, equip: { ...x.equip, [k]: p.equip[k]! } }));
  }
  for (const [id, lv] of Object.entries(p.skills)) {
    add(`skill.${id}`, skillName(Number(id)), c.skills[Number(id)] ?? 0, lv, (x) => ({ ...x, skills: { ...x.skills, [id]: lv }, followPlan: false }));
  }
  return rows;
}

/**
 * Keep only dark grey/black text (the values in the stat and skill windows), as black on
 * white. Coloured things (the pink/green label badges and their white lettering, the game
 * world behind the windows) become background: the badge labels read as noise, and the
 * parser finds values by their position and shape instead.
 */
export function inkMask(px: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const n = w * h;
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const grey = Math.max(r, g, b) - Math.min(r, g, b) < 40;
    const v = lum < 140 && grey ? 0 : 255;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Enlarge smoothly first (thin strokes survive), then turn all text black on white. */
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const scale = bmp.width < 1000 ? 3 : bmp.width < 2200 ? 2 : 1;
  const cv = document.createElement('canvas');
  cv.width = bmp.width * scale;
  cv.height = bmp.height * scale;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, cv.width, cv.height);
  const img = g.getImageData(0, 0, cv.width, cv.height);
  img.data.set(inkMask(img.data, cv.width, cv.height));
  g.putImageData(img, 0, 0);
  return cv;
}

/**
 * OCR on this device with Tesseract (loaded only when used). The image never leaves the
 * browser; only the OCR engine and English model are downloaded (~5 MB, then cached).
 */
export async function readScreenshot(file: Blob, onProgress?: (p: number, status: string) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: (m: { progress: number; status: string }) => onProgress?.(m.progress, m.status),
  });
  try {
    const { data } = await worker.recognize(await prepare(file));
    return data.text;
  } finally {
    await worker.terminate();
  }
}

export interface RankedCharacter {
  name: string;
  level: number;
  job: JobId | undefined;
  jobLabel: string;
}

/** Public ClassicRank lookup (Windia). Gives name, level and job only. */
export async function lookupByName(name: string): Promise<RankedCharacter | null> {
  const clean = name.trim();
  if (!/^[A-Za-z0-9]{2,12}$/.test(clean)) throw new Error('Names are 2-12 letters or digits.');
  const r = await fetch(`https://classicrank.com/api/v1/characters?names=${encodeURIComponent(clean)}`);
  if (r.status === 429) throw new Error('ClassicRank is rate-limiting lookups; try again in a minute.');
  if (!r.ok) throw new Error(`ClassicRank returned ${r.status}.`);
  const body = (await r.json()) as { data?: { name: string; level: number; job: string }[] };
  const hit = body.data?.find((x) => x.name.toLowerCase() === clean.toLowerCase());
  return hit ? { name: hit.name, level: hit.level, job: jobFromName(hit.job), jobLabel: hit.job } : null;
}
