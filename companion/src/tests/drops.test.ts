import { describe, expect, it } from 'vitest';
import { MONSTERS, ITEMS } from '../data';
import { likelyDroppers } from '../calculators/drops';

const item = (name: string) => ITEMS.find((i) => i.name === name);
const names = (n: string) => [...new Set(likelyDroppers(item(n), MONSTERS).map((d) => d.mob.name))];

describe('likely quest item droppers', () => {
  it('matches the monster the item is named after, longest name first', () => {
    expect(names('Orange Mushroom Cap')).toEqual(['Orange Mushroom']);
    expect(names('Horny Mushroom Cap')).toEqual(['Horny Mushroom']);
    expect(likelyDroppers(item('Snail Shell'), MONSTERS)[0].clue).toBe('item-name');
  });
  it('falls back to a monster the item description names', () => {
    const d = likelyDroppers(item('Firewood'), MONSTERS);
    expect(d.map((x) => x.mob.name)).toContain('Axe Stump');
    expect(d[0].clue).toBe('item-text');
  });
  it('guesses nothing for letters and NPC items', () => {
    expect(names("Lucas's Letter")).toEqual([]);
    expect(likelyDroppers(undefined, MONSTERS)).toEqual([]);
  });
});

describe('drops seen in game', () => {
  it('adds reported droppers first, then the name guesses', async () => {
    const { DROP_REPORTS } = await import('../data/dropReports');
    const { itemById } = await import('../data');
    const found = likelyDroppers(itemById.get(4000015), MONSTERS, DROP_REPORTS);
    const names = [...new Set(found.map((d) => d.mob.name))];
    expect(names[0]).toBe('Dark Axe Stump');
    expect(names).toContain('Axe Stump');
    expect(found.find((d) => d.mob.name === 'Dark Axe Stump')!.clue).toBe('reported');
  });
});
