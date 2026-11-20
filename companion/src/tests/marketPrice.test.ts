import { describe, expect, it } from 'vitest';
import { usualPrice } from '../calculators/marketPrice';

const d = (day: string, median: number, count: number) => ({ day, median, count });

describe('usual price from daily history', () => {
  it('is the sales-weighted median of the last week', () => {
    const r = usualPrice([d('2026-11-01', 1800, 8), d('2026-11-03', 2000, 13), d('2026-11-04', 1999, 17), d('2026-11-05', 1949, 18), d('2026-10-20', 9999, 50)]);
    expect(r).toEqual({ price: 1999, sales: 56, asOf: '2026-11-05' });
  });

  it('ignores one odd sale and days with no sales', () => {
    expect(usualPrice([d('2026-11-05', 2000, 10), d('2026-11-04', 90000, 1), d('2026-11-03', 0, 0)])!.price).toBe(2000);
    expect(usualPrice([])).toBeNull();
  });
});

describe('local prices', () => {
  it('shortens mesos and flags week-old prices', async () => {
    const { shortMesos, isStale } = await import('../data/localPrices');
    expect(shortMesos(1999)).toBe('1,999');
    expect(shortMesos(13500)).toBe('14K');
    expect(shortMesos(1_490_000)).toBe('1.49M');
    const now = Date.parse('2026-11-10T00:00:00Z');
    expect(isStale({ meowId: 1, name: 'x', url: '', price: 1, sales: 1, asOf: null, fetchedAt: '2026-11-08T00:00:00Z' }, now)).toBe(false);
    expect(isStale({ meowId: 1, name: 'x', url: '', price: 1, sales: 1, asOf: null, fetchedAt: '2026-11-01T00:00:00Z' }, now)).toBe(true);
  });
});
