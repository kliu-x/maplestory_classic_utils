import { describe, expect, it } from 'vitest';
import { QUESTS } from '../data';
import { QUEST_GENERAL, QUEST_SOURCES, QUEST_TIPS } from '../data/questGuide';

describe('quest guide tips', () => {
  const ids = new Set(QUESTS.map((q) => q.id));

  it('every tip belongs to a real Classic World quest and cites a source', () => {
    expect(Object.keys(QUEST_TIPS).length).toBeGreaterThan(200);
    for (const [id, t] of Object.entries(QUEST_TIPS)) {
      expect(ids.has(Number(id)), `quest ${id}`).toBe(true);
      expect(t.tip.length).toBeGreaterThan(0);
      expect(t.sourceIds.length).toBeGreaterThan(0);
      for (const s of t.sourceIds) expect(QUEST_SOURCES[s]?.source_url).toMatch(/^https:\/\//);
      if (t.worth) expect(['must-do', 'good', 'skip']).toContain(t.worth);
    }
    for (const g of QUEST_GENERAL) for (const s of g.sourceIds) expect(QUEST_SOURCES[s]).toBeDefined();
  });

  it('keeps known disagreements visible', () => {
    expect(Object.values(QUEST_TIPS).some((t) => t.conflict)).toBe(true);
    expect(QUEST_GENERAL.some((g) => /conflict/i.test(g.topic))).toBe(true);
  });
});
