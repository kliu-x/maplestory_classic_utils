// Read the game's bottom status bar ("LV. 26  Magician  HP[611/611]  MP[1000/1000]
// EXP 11,152[20.31%]") from OCR text. OCR on that small font slips on brackets and some
// digits, so values are cross-checked: EXP must agree with its own percentage for some
// level, which also tells us the level without reading "LV." at all.

import { expForLevel } from '../data/expTable';

export interface BarReading {
  level?: number;
  exp?: number;
  expPct?: number;
  hp?: number;
  hpMax?: number;
  mp?: number;
  mpMax?: number;
}

export interface BarHints {
  level?: number;
  hpMax?: number;
  mpMax?: number;
}

/** "a/b"; or, when the slash is lost ("8501000"), split using the known maximum. */
function pool(text: string, label: 'HP' | 'MP', max?: number): { cur: number; max: number } | null {
  const m = new RegExp(`${label}\\W{0,3}(\\d{1,6})\\s*[/|]\\s*(\\d{1,6})`, 'i').exec(text);
  if (m && +m[1] <= +m[2]) return { cur: +m[1], max: +m[2] };
  const d = new RegExp(`${label}\\W{0,3}(\\d{2,12})`, 'i').exec(text)?.[1];
  if (!d) return null;
  if (max && d.endsWith(String(max)) && d.length > String(max).length) {
    const cur = +d.slice(0, d.length - String(max).length);
    if (cur <= max) return { cur, max };
  }
  if (d.length % 2 === 0 && d.slice(0, d.length / 2) === d.slice(d.length / 2)) return { cur: +d.slice(d.length / 2), max: +d.slice(d.length / 2) };
  return null;
}

/** EXP and level from "EXP 11,152[20.31%]" (often read as "EXP 11.152120.31%"). */
function expAndLevel(text: string, hintLevel?: number): { exp: number; pct: number; level: number } | null {
  const at = text.search(/EXP/i);
  if (at < 0) return null;
  const rest = text.slice(at + 3, at + 40);
  const p = /(\d+)[.,](\d{2})\s*%/.exec(rest);
  if (!p) return null;
  // "...152120.31%": the percentage is at most "100"; digits before it belong to the EXP
  // number or are the misread bracket.
  const whole = p[1];
  // Single- or double-digit percentage: try both, keep whichever agrees with the EXP.
  const splits = [2, 1, ...(whole.endsWith('100') ? [3] : [])].filter((k) => k <= whole.length);
  const levels = hintLevel ? [hintLevel, hintLevel + 1, hintLevel - 1, ...Array.from({ length: 99 }, (_, i) => i + 1)] : Array.from({ length: 99 }, (_, i) => i + 1);
  for (const keep of splits) {
    const pct = +`${whole.slice(-keep)}.${p[2]}`;
    const digits = (rest.slice(0, p.index) + whole.slice(0, whole.length - keep)).replace(/\D/g, '');
    // The bracket before the percentage is often read as a digit: try with and without it.
    const candidates = [digits, digits.slice(0, -1)].filter((d) => d.length > 0 && d.length <= 13).map(Number);
    for (const lv of levels) {
      const need = expForLevel(lv);
      if (!need) continue;
      for (const exp of candidates) {
        // The game shows the percentage truncated to 2 decimals.
        if (exp < need && Math.abs((exp / need) * 100 - pct) < 0.011) return { exp, pct, level: lv };
      }
    }
  }
  return null;
}

export function parseStatusBar(text: string, hints: BarHints = {}): BarReading {
  const t = text.replace(/\n/g, ' ');
  const out: BarReading = {};
  const e = expAndLevel(t, hints.level);
  if (e) {
    out.exp = e.exp;
    out.expPct = e.pct;
    out.level = e.level;
  }
  const hp = pool(t, 'HP', hints.hpMax);
  if (hp) [out.hp, out.hpMax] = [hp.cur, hp.max];
  const mp = pool(t, 'MP', hints.mpMax);
  if (mp) [out.mp, out.mpMax] = [mp.cur, mp.max];
  return out;
}

/** Enlarge the boxed status bar for OCR (the font is tiny); no thresholding, it reads best as is. */
export function prepareBar(source: CanvasImageSource, box: { x: number; y: number; w: number; h: number }, scale = 2): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(box.w * scale);
  c.height = Math.round(box.h * scale);
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(source, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
  return c;
}

/** A Tesseract worker kept alive between frames (starting one takes ~1 s). */
export async function createBarReader() {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  return {
    read: async (canvas: HTMLCanvasElement) => (await worker.recognize(canvas)).data.text,
    close: () => worker.terminate(),
  };
}
