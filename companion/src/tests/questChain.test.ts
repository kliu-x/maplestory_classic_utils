import { describe, expect, it } from 'vitest';
import { questSteps } from '../calculators/questChain';
import { QUESTS } from '../data';

describe('quest step numbers', () => {
  it('numbers a straight chain 1..n', () => {
    const s = questSteps([{ id: 1, prereqQuestIds: [] }, { id: 2, prereqQuestIds: [1] }, { id: 3, prereqQuestIds: [2] }, { id: 9, prereqQuestIds: [] }]);
    expect(s.get(1)).toMatchObject({ step: 1, of: 3, chain: [1, 2, 3] });
    expect(s.get(3)!.step).toBe(3);
    expect(s.has(9)).toBe(false); // a lone quest has no steps
  });

  it('a quest after two branches comes after the longer one', () => {
    const s = questSteps([{ id: 1, prereqQuestIds: [] }, { id: 2, prereqQuestIds: [1] }, { id: 3, prereqQuestIds: [] }, { id: 4, prereqQuestIds: [2, 3] }]);
    expect(s.get(4)).toMatchObject({ step: 3, of: 3 });
    expect(s.get(3)!.step).toBe(1);
  });

  it('Maple Island: Heena\'s mirror quests are steps 1 and 2', () => {
    const s = questSteps(QUESTS);
    expect(s.get(1000)!.step).toBe(1);
    expect(s.get(1001)!.step).toBe(2);
  });
});
