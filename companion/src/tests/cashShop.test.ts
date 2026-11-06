import { describe, expect, it } from 'vitest';
import { averageOpens, chanceInOpens, costOfOpens, opensForChance } from '../calculators/crate';
import { CASH_PRICES, CRATES, cashPriceFor, crateFor, crateItem, cratesWith, saleState } from '../data/cashShop';
import { ITEMS } from '../data';

describe('crate odds', () => {
  it('works out chances from the published rate', () => {
    expect(chanceInOpens(1, 1)).toBeCloseTo(0.01);
    expect(chanceInOpens(1, 100)).toBeCloseTo(0.634, 3);
    expect(chanceInOpens(0, 50)).toBe(0);
    expect(averageOpens(2)).toBe(50);
    expect(opensForChance(1, 0.5)).toBe(69);
    expect(opensForChance(3, 0.5)).toBe(23);
  });

  it('buys crates the cheapest way', () => {
    const price = { one: 3500, bundle: { count: 11, price: 35000 } };
    expect(costOfOpens(11, price)).toBe(35000);
    expect(costOfOpens(12, price)).toBe(38500);
    expect(costOfOpens(21, price)).toBe(70000); // 10 singles cost more than a second 11-pack
    expect(costOfOpens(5, { one: 20, bundle: { count: 10, price: 200 } })).toBe(100); // no bundle discount
  });
});

describe('Cash Shop data', () => {
  it('has crate rates that add up to 100% and pieces the game knows', () => {
    for (const c of CRATES) {
      expect(c.rewards.reduce((s, r) => s + r.rate, 0), c.key).toBeCloseTo(100, 5);
      expect(c.rewards.filter((r) => !crateItem(r.name)).map((r) => r.name), c.key).toEqual([]);
      expect(c.source.source_url).toMatch(/^https:\/\//);
      expect(ITEMS.find((i) => i.id === c.itemId)?.cash, c.key).toBe(true);
    }
  });

  it('knows which crate is on sale', () => {
    const nov4 = CRATES.find((c) => c.key === 'mystery-nov4')!;
    expect(saleState(nov4, '2026-11-06')).toBe('on sale');
    expect(saleState(nov4, '2026-11-19')).toBe('ended');
    expect(crateFor(5222000, '2026-11-06')?.key).toBe('mystery-nov4');
    expect(cratesWith('teddy bear', '2026-11-06')).toEqual([{ crate: nov4, rate: 1 }]);
    expect(crateItem('Torn-up Jeans')?.id).toBe(1067047); // the game spells it "Torn-Up"
  });

  it('has an item in the game data for every NX price', () => {
    const cash = ITEMS.filter((i) => i.cash);
    expect(CASH_PRICES.filter((p) => !cash.some((i) => cashPriceFor(i) === p)).map((p) => p.name)).toEqual([]);
    expect(cashPriceFor({ name: 'Safety Charm' })?.nx).toBe(800);
  });
});
