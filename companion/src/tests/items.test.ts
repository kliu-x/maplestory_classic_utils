import { describe, expect, it } from 'vitest';
import type { Item } from '../models/types';
import { GEAR_PICKS } from '../data/gearGuide';
import { gearPicksFor, itemsForPick, jobsOf, pickNames, statLine, usableBy } from '../data/itemInfo';
import { ITEMS } from '../data';
import { SHOP_PRICES, shopPriceFor } from '../data/shopPrices';

const wand: Item = { id: 1372003, name: 'Ice Wand', category: 'One-Handed Weapon', subCategory: 'Wand', reqLevel: 25, reqJob: 2, slots: 7, stats: { MAD: 48, INT: 3 } };

describe('item details', () => {
  it('finds usable items with their effect and shop price', () => {
    const unagi = ITEMS.find((i) => i.name === 'Unagi')!;
    expect(unagi.description).toContain('Restores 1,000 HP');
    expect(shopPriceFor(unagi)?.price).toBe(1000);
  });

  it('has an item in the game data for every shop price', () => {
    const priced = new Set(ITEMS.map((i) => shopPriceFor(i)?.name));
    expect(SHOP_PRICES.filter((p) => !priced.has(p.name)).map((p) => p.name)).toEqual([]);
  });

  it('summarises stats like the tooltip', () => {
    expect(statLine(wand)).toBe('INT +3 · Magic ATT 48 · 7 slots');
    expect(jobsOf(2)).toEqual(['Magician']);
    expect(usableBy(wand, 'Magician')).toBe(true);
    expect(usableBy(wand, 'Thief')).toBe(false);
    expect(usableBy({ id: 1, name: 'Hat' }, 'Thief')).toBe(true);
  });

  it('splits gear-pick names and drops (male)/(female)', () => {
    const p = GEAR_PICKS.find((x) => x.item.startsWith('Blue Doros Robe'))!;
    expect(pickNames(p)).toEqual(['blue doros robe', 'brown doroness robe']);
  });

  it('links a gear pick to the item with its shop price', () => {
    expect(gearPicksFor(wand).some((p) => p.estCost === 13500)).toBe(true);
    const pick = GEAR_PICKS.find((x) => x.item === 'Ice Wand')!;
    expect(itemsForPick(pick, [wand]).map((i) => i.id)).toEqual([1372003]);
  });
});
