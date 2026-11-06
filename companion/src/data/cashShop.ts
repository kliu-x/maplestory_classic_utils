import type { Item, SourceMeta } from '../models/types';
import cratesJson from './cashCrates.json';
import cashEquipsJson from './generated/cashEquips.json';

// Cash Shop prices and Mystery Fashion Crate rates, as Nexon published them. NX prices are what the
// Cash Shop charges; the crate pieces themselves can be traded for mesos (see the market links).

const R = '2026-11-06';
const nexon = (url: string, title: string): SourceMeta => ({ source_url: url, source_title: title, retrieved_at: R, game_version_or_date: 'Classic World', verification_status: 'verified' });

export const CASH_SOURCES = {
  founders: nexon('https://www.nexon.com/maplestory/news/sale/45819/founder-s-access-cash-shop', "Nexon: Founder's Access Cash Shop (Oct 5, 2026): the evergreen price list"),
  grandLaunch: nexon('https://www.nexon.com/maplestory/news/sale/46362/grand-launch-cash-shop-update', 'Nexon: Grand Launch Cash Shop update (Oct 20, 2026)'),
  nov4: nexon('https://www.nexon.com/maplestory/news/sale/47031/classic-world-cash-shop-update-nov-4', 'Nexon: Classic World Cash Shop update, Nov 4 (Nov 3, 2026)'),
};

export interface CrateReward {
  name: string;
  /** Published rate in percent (2 = 2%). */
  rate: number;
}

export interface Crate {
  key: string;
  name: string;
  /** Game item id of the crate itself. */
  itemId: number;
  label: string;
  price: { currency: string; one: number; bundle?: { count: number; price: number } };
  sale: { from: string; until: string; untilNote?: string };
  rewards: CrateReward[];
  /** Where the rates come from. */
  source: SourceMeta;
  /** Where the price and sale dates come from. */
  saleSource: SourceMeta;
}

export const CRATES = cratesJson as Crate[];

const CASH_EQUIPS = cashEquipsJson as Record<string, { id: number; slot: string }[]>;

/** Game id and slot of a crate piece (icons, slot column). Pieces can have a male and a female id. */
export function crateItem(name: string): { id: number; slot: string } | undefined {
  const it = CASH_EQUIPS[name.toLowerCase()]?.[0];
  // Weapon covers sit under the game's "Cash" weapon type.
  return it && (it.slot === 'Cash' ? { ...it, slot: 'Weapon cover' } : it);
}

export type SaleState = 'on sale' | 'ended' | 'upcoming';

/** Sale state on a given day (ISO date). The last day counts as on sale. */
export function saleState(c: Crate, today: string): SaleState {
  if (today < c.sale.from) return 'upcoming';
  return today > c.sale.until ? 'ended' : 'on sale';
}

/** Crates holding a piece, current sales first. */
export function cratesWith(name: string, today: string): { crate: Crate; rate: number }[] {
  const n = name.trim().toLowerCase();
  const rank = (c: Crate) => ({ 'on sale': 0, upcoming: 1, ended: 2 })[saleState(c, today)];
  return CRATES.flatMap((crate) => crate.rewards.filter((r) => r.name.toLowerCase() === n).map((r) => ({ crate, rate: r.rate }))).sort((a, b) => rank(a.crate) - rank(b.crate));
}

export interface CashPrice {
  name: string;
  nx: number;
  /** Multi-buys, e.g. 12 for 3,600 NX. */
  bundles?: { count: number; nx: number }[];
  /** How long the item lasts once bought, as Nexon lists it. */
  duration: string;
  note?: string;
  /** Last sale day (ISO) when it's a limited sale. */
  until?: string;
  source: SourceMeta;
}

const F = CASH_SOURCES.founders;
const G = CASH_SOURCES.grandLaunch;
const N = CASH_SOURCES.nov4;
const p = (name: string, nx: number, duration: string, source: SourceMeta, extra: Partial<CashPrice> = {}): CashPrice => ({ name, nx, duration, source, ...extra });
const many = (names: string, nx: number, duration: string, source: SourceMeta, extra: Partial<CashPrice> = {}) => names.split(', ').map((n) => p(n, nx, duration, source, extra));
const megaBundles = (three: number, twelve: number) => [{ count: 3, nx: three }, { count: 12, nx: twelve }];

/** Items you can buy on their own. Packages are in CASH_PACKAGES. */
export const CASH_PRICES: CashPrice[] = [
  p('Mystery Hair Coupon', 5500, '14 days', N, { note: 'Random hair from the current list (6 per gender).', until: '2026-11-11' }),
  p('Mystery Face Coupon', 3500, '14 days', N, { note: 'Random face from the current list (6 per gender).', until: '2026-11-11' }),
  p('Signature Hair Coupon', 7500, '14 days', F, { note: 'Pick a hair from the list.' }),
  p('Signature Face Coupon', 5500, '14 days', F, { note: 'Pick a face from the list.' }),
  p('Mystery Hair Color Coupon', 1700, '14 days', F),
  p('Signature Hair Color Coupon', 4500, '14 days', F),
  p('Signature Eye Color Coupon', 2500, '14 days', F),
  p('Signature Skin Color Coupon', 2000, '14 days', F),
  p('Beauty Album Hair Slot Film', 20000, '14 days', G, { note: 'One more saved hair, for good (max 24).' }),
  p('Beauty Album Face Slot Film', 16000, '14 days', G, { note: 'One more saved face, for good (max 24).' }),
  ...many('Brown Kitty, Brown Puppy, Pink Bunny, Black Kitty, White Bunny, Black Pig', 3500, '30 days', F, { note: 'Pet. Water of Life adds 30 days.' }),
  p('Water of Life', 2000, '30 days', F, { note: 'Adds 30 days to a pet, or revives a pet doll at Mar the Fairy (Ellinia).' }),
  p('Pet Name Tag', 1800, 'Permanent', F),
  p('Auto HP Potion Skill', 2500, 'Permanent', F),
  p('Auto MP Potion Skill', 2500, 'Permanent', F),
  p('Auto Move Skill', 3000, 'Permanent', F),
  p('Expanded Auto Move Skill', 3000, 'Permanent', F, { note: 'Triples the auto move distance; needs Auto Move Skill.' }),
  p('AP Reset Scroll', 7000, 'Permanent', F, { note: 'Resets all AP, including HP/MP. Lv 10+.' }),
  p('SP Reset Scroll', 7000, 'Permanent', F, { note: 'Resets all skills except Beginner skills.' }),
  p('Megaphone', 350, '90 days', N, { bundles: megaBundles(1000, 3600), note: 'Your channel. Lv 15+.' }),
  p('Super Megaphone', 1500, '90 days', N, { bundles: megaBundles(4300, 13200), note: 'The whole world. Lv 15+.' }),
  p('Item Megaphone', 1500, '90 days', N, { bundles: megaBundles(4300, 13200), note: 'Shows an item to the whole world. Lv 15+.' }),
  p('Storage Room 5-slot Coupon', 5000, 'Permanent', F, { note: 'Up to 150 storage slots.' }),
  p('Selective 5-slot Coupon', 5000, 'Permanent', F, { note: 'One inventory tab, up to 150 slots.' }),
  p('Safety Charm', 800, '90 days', F, { bundles: megaBundles(2300, 8400), note: 'No EXP lost on death, used up when it saves you.' }),
  p('Regular Store Permit', 1500, '90 days', F, { note: '12 items.' }),
  p('Pink Store Permit', 3000, '90 days', F, { note: '18 items.' }),
  p('Fall Store Permit', 3000, '90 days', F, { note: '18 items.', until: '2026-11-18' }),
  ...many('Sprinkled Flowers, Soap Bubbles, Sprinkled Presents, Sprinkled Candy, Sprinkled Chocolate, Sprinkled Flower Petals, Sprinkled Maple Leaves, Fireworks', 300, 'Permanent', F, {
    bundles: [{ count: 11, nx: 3000 }],
    note: 'Weather effect with your message for 30 seconds.',
  }),
];

export interface CashPackage {
  name: string;
  nx: number;
  was: number;
  limit: string;
  contains: string[];
  source: SourceMeta;
}

export const CASH_PACKAGES: CashPackage[] = [
  { name: 'Beauty Essentials Pack', nx: 5900, was: 12500, limit: 'Once per account', contains: ['Mystery Fashion Crate', 'Mystery Hair Coupon', 'Mystery Face Coupon'], source: N },
  {
    name: 'Monthly Essentials', nx: 9900, was: 28600, limit: 'Once per world every 30 days',
    contains: ['20 Megaphone Exchange Coupon', 'Transparent Hat, Cape and Shoes (30 days)', '5 Double Item Megaphone Exchange Coupon', 'Special Store Permit (30 days)', 'Portable Storage (30 days)'], source: F,
  },
  { name: 'Convenience Essentials Pack', nx: 9900, was: 42000, limit: 'Once per account', contains: ['SP Reset Scroll', 'AP Reset Scroll', 'Selective 5-slot Coupon', 'Safety Charm × 10', 'Super Megaphone × 10'], source: F },
  { name: 'Pet Booster Essentials Pack', nx: 9900, was: 47000, limit: 'Once per account', contains: ['Auto HP Potion Skill', 'Auto MP Potion Skill', 'Auto Move Skill', 'Expanded Auto Move Skill', '30 Premium Pet Food Exchange Coupon'], source: F },
];

const priceByName = new Map(CASH_PRICES.map((c) => [c.name.toLowerCase(), c]));
export function cashPriceFor(item: Pick<Item, 'name'>): CashPrice | undefined {
  return priceByName.get(item.name.trim().toLowerCase());
}

/** The crate an item id is, if it's one of the Mystery Fashion Crates (the current sale first). */
export function crateFor(itemId: number, today: string): Crate | undefined {
  return CRATES.filter((c) => c.itemId === itemId).sort((a, b) => (saleState(a, today) === 'on sale' ? -1 : 0) - (saleState(b, today) === 'on sale' ? -1 : 0))[0];
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
