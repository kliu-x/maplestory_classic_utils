import { describe, expect, it } from 'vitest';
import { parseStatusBar } from '../integrations/statusBar';
import { summarize, type Sample } from '../calculators/session';
import { expForLevel } from '../data/expTable';

describe('status bar reading', () => {
  it('reads real OCR output of the bar, fixing the misread bracket', () => {
    // From a real Classic World screenshot: "EXP 11,152[20.31%]" came out as "11.152120.31%".
    const r = parseStatusBar('LV. 28 Magician HPe11/811) MP 1000/1000) EXP 11.152120.31%)');
    expect(r).toMatchObject({ exp: 11152, expPct: 20.31, level: 26, mp: 1000, mpMax: 1000 });
  });

  it('splits MP when the slash is lost, using the known maximum', () => {
    expect(parseStatusBar('MP 8501000 EXP 11152[20.31%]', { mpMax: 1000 })).toMatchObject({ mp: 850, mpMax: 1000 });
  });

  it('gives nothing rather than a wrong EXP when the percentage does not fit', () => {
    expect(parseStatusBar('EXP 99999[20.31%]').exp).toBeUndefined();
  });
});

describe('session report', () => {
  // 5 minutes on Bubblings (28 EXP each), one-shotting, 20 MP per Energy Bolt, a reading every 2 s.
  const lv = 26;
  const samples: Sample[] = [];
  let exp = 11152;
  let mp = 1000;
  for (let t = 0; t <= 300; t += 2) {
    if (t > 0) {
      exp += t % 4 === 0 ? 28 : t % 10 === 0 ? 56 : 0; // usually 1 kill, sometimes 2 in a reading
      mp -= t % 4 === 0 ? 20 : t % 10 === 0 ? 40 : 0;
      if (mp < 300) mp += 500; // potion
    }
    samples.push({ t, level: lv, exp, mp, mpMax: 1000 });
  }

  it('counts EXP, kills, casts and potions', () => {
    const r = summarize(samples, { mpPerCast: 20 });
    expect(r.expGained).toBe(exp - 11152);
    expect(r.expPerKill).toBe(28);
    expect(r.kills).toBe(Math.round(r.expGained / 28));
    expect(r.castsPerKill).toBeCloseTo(1, 1);
    expect(r.potions).toBeGreaterThan(0);
    expect(r.rejected).toBe(0);
    expect(r.expPerMin).toBeCloseTo((r.expGained * 60) / 300, 5);
  });

  it('throws out misreads and handles a level-up', () => {
    const noisy: Sample[] = [
      { t: 0, level: 26, exp: 54800 },
      { t: 2, level: 26, exp: 54828 },
      { t: 4, level: 26, exp: 5482 }, // misread: backwards
      { t: 6, level: 26, exp: 54856 },
      { t: 8, level: 27, exp: 4 }, // level up: 54900 - 54856 = 44 + 4
      { t: 10, level: 27, exp: 32 },
    ];
    const r = summarize(noisy);
    expect(r.rejected).toBe(1);
    expect(r.levelUps).toBe(1);
    expect(r.expGained).toBe(28 + 28 + (expForLevel(26) - 54856) + 4 + 28);
  });

  it('separates breaks from hunting time', () => {
    const withBreak: Sample[] = [0, 2, 4, 6, 8].map((t, i) => ({ t, level: 26, exp: 100 + i * 28 }));
    withBreak.push({ t: 200, level: 26, exp: 100 + 5 * 28 }, { t: 202, level: 26, exp: 100 + 6 * 28 });
    const r = summarize(withBreak, { idleAfter: 30 });
    expect(r.activeSeconds).toBeLessThan(r.seconds);
    expect(r.expPerActiveMin).toBeGreaterThan(r.expPerMin);
  });
});

describe('status bar: single-digit percentages', () => {
  it('does not mistake a misread bracket for a tens digit', () => {
    // EXP 2,915[5.31%] at Lv 26 (5.31% of 54,900), bracket read as "1"
    expect(parseStatusBar('EXP 2.91515.31%', { level: 26 })).toMatchObject({ exp: 2915, expPct: 5.31, level: 26 });
  });
});
