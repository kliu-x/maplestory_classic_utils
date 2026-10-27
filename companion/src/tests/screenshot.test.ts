import { describe, expect, it } from 'vitest';
import { jobFromName, parseScreenshotText, reviewRows, splitBonus } from '../integrations/screenshot';
import { skillsForJob } from '../data';
import { newCharacter } from '../storage/store';

// Roughly what OCR returns for a Character Stat + Skill window screenshot, with typical
// noise: an item tooltip over the stat window and the bottom status bar.
const SAMPLE = `CHARACTER STAT
NAME Kayloo
JOB MAGICIAN
LEVEL 26
HP 611/611
MP 1000/1000
EXP. 11152 (20%)
FAME 0
Yellow Wind Shoes
REQ LEV : 25
REQ INT : 40
REQ LUK : 15
STR 4
DEX 4
INT 134 (127+7)
LUK 16 (15+1)
ABILITY POINT 0
SKILL INVENTORY
Introduction to Magic
Improved MP Reco...
15
Max MP Increase
13
Magic Guard
1
Magic Armor
0
Energy Bolt
20
Magic Claw
0
SKILL POINT 0
LV. 26 Magician Kayloo HP[611/611] MP[1000/1000] EXP 11,152[20.31%]`;

describe('screenshot parsing', () => {
  const skills = skillsForJob('magician');
  const p = parseScreenshotText(SAMPLE, skills);

  it('reads profile fields', () => {
    expect(p).toMatchObject({ name: 'Kayloo', job: 'magician', level: 26, hp: 611, mp: 1000, currentExp: 11152 });
  });

  it('splits base and equipment stats and ignores tooltip requirements', () => {
    expect(p.base).toEqual({ str: 4, dex: 4, int: 127, luk: 15 });
    expect(p.equip).toEqual({ str: 0, dex: 0, int: 7, luk: 1 });
  });

  it('reads skill levels, including truncated names', () => {
    expect(p.skills).toMatchObject({ 2000000: 15, 2000001: 13, 2001000: 1, 2001001: 0, 2001002: 20, 2001003: 0 });
  });

  it('copes with the level on the same line and missing fields', () => {
    const q = parseScreenshotText('Energy Bolt 18\nLV. 24', skills);
    expect(q.skills[2001002]).toBe(18);
    expect(q.level).toBe(24);
    expect(q.hp).toBeUndefined();
  });

  it('review rows only list fields that were read and differ', () => {
    const c = { ...newCharacter('magician', 'Kayloo'), level: 26 };
    const rows = reviewRows(c, p, String);
    expect(rows.find((r) => r.key === 'level')).toBeUndefined();
    const all = rows.reduce((x, r) => r.apply(x), c);
    expect(all).toMatchObject({ currentExp: 11152, hp: 611, base: { int: 127 }, equip: { int: 7 }, followPlan: false });
    expect(all.skills[2001002]).toBe(20);
  });

  it('reads side-by-side windows where OCR joins the rows', () => {
    const joined = `Kayloo Improved MP Reco...
MAGICIAN 15
26 Max MP Increase
611/611 13
1000/1000 Magic Guard
11152 (20%) 1
0 Magic Armor
4 Energy Bolt
134 (127+7) 20
16 (15+1) Magic Claw
0`;
    expect(parseScreenshotText(joined, skills).skills).toEqual({ 2000000: 15, 2000001: 13, 2001000: 1, 2001002: 20, 2001003: 0 });
  });

  it('reads the stat window by position when the labels are unreadable', () => {
    // What OCR returns once the white-on-pink labels are dropped, joined with the skill window.
    const noLabels = `Kayloo Improved MP Reco...
MAGICIAN 15
26 Max MP Increase
611/611 13
1000/1000 Magic Guard
11152 (20%) 1
0 Magic Armor
4 0
4 Energy Bolt
134 (12747) 20
16 (15+1} Magic Claw
0`;
    const q = parseScreenshotText(noLabels, skills);
    expect(q).toMatchObject({ job: 'magician', level: 26, hp: 611, mp: 1000, currentExp: 11152 });
    expect(q.base).toEqual({ str: 4, dex: 4, int: 127, luk: 15 });
    expect(q.equip).toEqual({ str: 0, dex: 0, int: 7, luk: 1 });
  });

  it('does not take a skill level on its own line for a stat', () => {
    const real = `Kayloo Improved MP Reco...
MAGICIAN 15
26 Max MP Increase
611/611 13
1000/1000 Magic Guard
11152 (20%) 1
0 Magic Armor
4 0
4 Energy Bolt

20
134 (127+7)
16 (15+1) Magic Claw

0
`;
    const q = parseScreenshotText(real, skills);
    expect(q.base).toEqual({ str: 4, dex: 4, int: 127, luk: 15 });
    expect(q.skills[2001002]).toBe(20);
  });

  it('leaves stats blank rather than misaligning them when a stat line is garbled', () => {
    const garbled = `611/611
1000/1000
11152 (20%) 1
0 Magic Armor
El 0
3 Energy Bolt
134 (12747) 20
16 (15+1) Magic Claw`;
    expect(parseScreenshotText(garbled, skills).base).toEqual({});
  });

  it('splits "(127+7)" even when OCR misreads the plus', () => {
    expect(splitBonus(134, '127+7')).toEqual([127, 7]);
    expect(splitBonus(134, '12747')).toEqual([127, 7]);
    expect(splitBonus(16, '15t1')).toEqual([15, 1]);
    expect(splitBonus(50, '12+7')).toBeNull();
  });

  it('maps job names from the game and ClassicRank', () => {
    expect(jobFromName('MAGICIAN')).toBe('magician');
    expect(jobFromName('Wizard (Fire/Poison)')).toBe('wizard_fp');
    expect(jobFromName('Spearman')).toBe('swordsman');
    expect(jobFromName('Hunter')).toBe('archer');
    expect(jobFromName('Assassin')).toBe('assassin');
  });
});
