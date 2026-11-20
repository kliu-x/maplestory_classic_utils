// One "usual price" from NiaDB's daily Free Market history (median, low, high and sales per
// day): the sales-weighted median of the daily medians over the latest week that has sales.
// Weighting by sales keeps a day with one odd sale from moving it.

export interface DailyPrice {
  day: string; // ISO date
  median: number;
  count: number;
}

export interface UsualPrice {
  price: number;
  sales: number;
  /** Last day with a sale. */
  asOf: string;
}

export function usualPrice(points: DailyPrice[], days = 7): UsualPrice | null {
  const sold = points.filter((p) => p.count > 0 && p.median > 0).sort((a, b) => a.day.localeCompare(b.day));
  if (!sold.length) return null;
  const asOf = sold[sold.length - 1].day;
  const from = new Date(Date.parse(asOf) - (days - 1) * 864e5).toISOString().slice(0, 10);
  const week = sold.filter((p) => p.day >= from).sort((a, b) => a.median - b.median);
  const sales = week.reduce((n, p) => n + p.count, 0);
  let seen = 0;
  for (const p of week) {
    seen += p.count;
    if (seen * 2 >= sales) return { price: p.median, sales, asOf };
  }
  return null;
}
