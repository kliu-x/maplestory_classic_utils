import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseNameResults, NAME_STATUSES } from '../integrations/nameChecker';
import { migrate, newCharacter, DEFAULT_ASSUMPTIONS, exportJson, importJson, getState } from '../storage/store';
import { resolveAttack } from '../calculators/attack';
import { monsterById } from '../data';
import { rankMaps, isPqVariant } from '../calculators/rank';

describe('name checker adapter', () => {
  it('never offers an "available" label for automated statuses', () => {
    for (const [status, meta] of Object.entries(NAME_STATUSES)) {
      if (status.startsWith('confirmed_')) continue;
      expect(meta.label.toLowerCase()).not.toMatch(/(^|[^n])available/);
    }
    expect(NAME_STATUSES.not_found_in_source.label).toMatch(/unconfirmed/);
  });

  it('rejects unknown statuses', () => {
    expect(() => parseNameResults(JSON.stringify({ results: [{ pokemon_name: 'Pikachu', lookup_status: 'available' }] }))).toThrow(/unknown lookup_status/);
  });

  const real = resolve(__dirname, '../../../pokemon_name_checker/output/results.json');
  it.skipIf(!existsSync(real))('parses the real results.json from Project 1', () => {
    const r = parseNameResults(readFileSync(real, 'utf8'));
    expect(r.rows.length).toBeGreaterThanOrEqual(39);
    expect(r.rows.every((x) => x.world === 'windia')).toBe(true);
  });
});

describe('storage', () => {
  it('migrate fills defaults for old/partial data and drops junk', () => {
    const s = migrate({ characters: [{ id: 'a', name: 'Old', job: 'thief', level: 12 }, null, 5], settings: { assumptions: { uptime: 0.5 } } });
    expect(s.characters).toHaveLength(1);
    expect(s.characters[0].observations).toEqual([]);
    expect(s.characters[0].base.luk).toBeGreaterThan(0);
    expect(s.settings.assumptions.uptime).toBe(0.5);
    expect(s.settings.assumptions.respawnSeconds).toBe(DEFAULT_ASSUMPTIONS.respawnSeconds);
    expect(s.settings.activeCharacterId).toBe('a');
  });

  it('export -> import round-trips', () => {
    const c = newCharacter('assassin', 'Round');
    importJson(JSON.stringify({ characters: [c], settings: { activeCharacterId: c.id } }));
    const text = exportJson();
    importJson(text);
    expect(getState().characters[0]).toMatchObject({ name: 'Round', job: 'assassin' });
    expect(() => importJson('{"hello":1}')).toThrow();
  });
});

describe('attack resolution', () => {
  const mage = { ...newCharacter('magician', 'M'), level: 22, base: { str: 4, dex: 4, int: 117, luk: 5 }, magicAttack: 25, skills: { 2001002: 1, 2001003: 20 } };
  const a = { ...DEFAULT_ASSUMPTIONS, adjustForAccuracy: false };
  const necki = monsterById.get(18)!; // Jr. Necki, M.DEF 30
  const hog = monsterById.get(24)!; // Iron Hog, M.DEF 100

  it('uses the formula estimate when nothing is measured', () => {
    const r = resolveAttack(mage, 2001003, necki, a);
    expect(r.provenance).toBe('estimated');
    expect(r.linesPerCast).toBe(2);
    expect(r.mpPerCast).toBe(20);
  });

  it('uses a measurement as-is on the same monster and projects it elsewhere by defense', () => {
    const obs = { id: 'o', skillId: 2001003, mobId: 18, min: 70, avg: 85, max: 100, hitRate: 1, note: '', recordedAt: '2026-10-26T00:00:00Z' };
    const c = { ...mage, observations: [obs] };
    const same = resolveAttack(c, 2001003, necki, a);
    expect(same.provenance).toBe('measured');
    expect(same.line.avg).toBe(85);
    const other = resolveAttack(c, 2001003, hog, { ...a, adjustForLevelGap: false });
    expect(other.provenance).toBe('projected');
    // raw = 85 * 130/100; on Iron Hog (M.DEF 100): raw * 100/200
    expect(other.line.avg).toBeCloseTo(85 * 1.3 * 0.5, 6);
  });

  it('ranks real maps and never suggests party-quest stage maps', () => {
    const rows = rankMaps({ ...mage, observations: [] }, 2001003, a);
    expect(rows.length).toBeGreaterThan(5);
    for (const r of rows) expect(r.spawns.some((s) => !isPqVariant(s.mobId))).toBe(true);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].result.netExpPerMin).toBeGreaterThanOrEqual(rows[i].result.netExpPerMin);
  });
});
