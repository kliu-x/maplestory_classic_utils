// What NPC shops charge for potions, food, ammo and scrolls. Shop lists are server-side, so
// the game files can't tell us these; they come from MeowDB's table of prices read in game.

import type { Item, SourceMeta } from '../models/types';

export interface ShopPrice {
  name: string;
  price: number;
  soldBy: string[];
  /** Town reputation some of the sellers ask for. */
  need?: string;
  /** Every seller is closed in this release. */
  notOpen?: boolean;
}

export const SHOP_PRICE_SOURCE: SourceMeta = {
  source_url: 'https://meowdb.com/msclassic/npc-shops/item-efficiency/consumables',
  source_title: 'MeowDB: Consumable Efficiency',
  retrieved_at: '2026-11-01',
  game_version_or_date: 'Classic World launch prices',
  verification_status: 'community_reported',
  notes: 'Fan database; prices read in game at launch. Equipment prices are not included here.',
};

const GROCERS = ['Mina', 'Luna', 'Len the Fairy', 'Arturo', 'Dr. Faymus', 'Valen', 'Mr. Sweatbottom'];
const CLOSED = ['Glibber', 'Hana'];

export const SHOP_PRICES: ShopPrice[] = [
  // Food and potions
  { name: 'Red Potion', price: 50, soldBy: ['Lucy', ...GROCERS] },
  { name: 'Meat', price: 80, soldBy: GROCERS },
  { name: 'Fried Chicken', price: 60, soldBy: ['Raymond', 'Max', 'Valen', '24 Hr Mobile Store'] },
  { name: 'Egg', price: 30, soldBy: ['Lucy', ...GROCERS] },
  { name: 'Apple', price: 20, soldBy: ['Lucy', ...GROCERS] },
  { name: 'Hot Dog', price: 180, soldBy: ['Raymond', 'Valen', '24 Hr Mobile Store'] },
  { name: 'Dried Squid', price: 180, soldBy: ['Max'] },
  { name: 'Orange Potion', price: 150, soldBy: ['Lucy', ...GROCERS] },
  { name: 'White Potion', price: 350, soldBy: GROCERS },
  { name: 'Hamburger', price: 350, soldBy: ['Raymond', 'Max', 'Valen', '24 Hr Mobile Store'], need: 'Raymond, Max: Town Resident+' },
  { name: 'Pizza', price: 252, soldBy: ['Raymond', 'Max', 'Valen', '24 Hr Mobile Store'], need: 'Raymond, Max: Recognized Guest+' },
  { name: 'Hot Dog Supreme', price: 480, soldBy: ['Valen', '24 Hr Mobile Store'] },
  { name: 'Ice Cream Pop', price: 1500, soldBy: ['Valen'] },
  { name: 'Unagi', price: 1000, soldBy: ['Raymond', 'Max', 'Valen', 'Mr. Sweatbottom', '24 Hr Mobile Store'], need: 'Raymond, Max: Town Patron+' },
  { name: 'Fat Sausage', price: 800, soldBy: ['Raymond', 'Max'], need: 'Distinguished Citizen+' },
  { name: 'Cake', price: 150, soldBy: ['Valen', '24 Hr Mobile Store'] },
  { name: "Mrs. Ming Ming's Stew", price: 480, soldBy: ['Raymond'], need: 'Trusted Neighbor+' },
  { name: "Andre's Seafood Soup", price: 480, soldBy: ['Max'], need: 'Trusted Neighbor+' },
  { name: 'Watermelon', price: 1920, soldBy: ['Valen'] },
  { name: 'Ribbon Pig Daydream', price: 500, soldBy: ['Max'], need: 'Citizen of Honor+' },
  { name: 'Orange Mushroom Daydream', price: 500, soldBy: ['Raymond'], need: 'Citizen of Honor+' },
  { name: 'Reindeer Milk', price: 2500, soldBy: CLOSED, notOpen: true },
  { name: 'Melting Cheese', price: 2000, soldBy: CLOSED, notOpen: true },
  { name: 'Lemon', price: 150, soldBy: GROCERS },
  { name: 'Orange', price: 50, soldBy: ['Lucy', ...GROCERS] },
  { name: 'Blue Potion', price: 220, soldBy: GROCERS },
  { name: 'Salad', price: 220, soldBy: ['Raymond', 'Max', 'Valen', '24 Hr Mobile Store'], need: 'Raymond, Max: Visitor+' },
  { name: 'Orange Juice', price: 540, soldBy: ['Raymond', 'Max'], need: 'Trusted Neighbor+' },
  { name: 'Grape Juice', price: 1260, soldBy: ['Raymond', 'Max'], need: 'Guardian of the Village+' },
  { name: 'Pure Water', price: 1120, soldBy: ['Valen', 'Mr. Sweatbottom', '24 Hr Mobile Store'] },
  { name: 'Red Bean Sundae', price: 2250, soldBy: ['Valen'] },
  { name: 'Sunset Dew', price: 3750, soldBy: CLOSED, notOpen: true },
  { name: 'Sunrise Dew', price: 3000, soldBy: CLOSED, notOpen: true },
  { name: 'Pet Food', price: 30, soldBy: ['Doofus'] },
  // Ammunition
  { name: 'Arrows for Bows', price: 1, soldBy: GROCERS },
  { name: 'Arrows for Crossbows', price: 1, soldBy: GROCERS },
  { name: 'Bronze Arrows for Bows', price: 2, soldBy: ['Raymond'], need: 'Helpful Stranger+' },
  { name: 'Bronze Arrows for Crossbows', price: 2, soldBy: ['Raymond'], need: 'Helpful Stranger+' },
  { name: 'Subi Throwing Stars', price: 500, soldBy: [...GROCERS, '24 Hr Mobile Store'] },
  { name: 'Wolbi Throwing Stars', price: 1000, soldBy: ['Max'], need: 'Helpful Stranger+' },
  // Scrolls
  { name: 'Topwear DEF Scroll: Lesser', price: 20000, soldBy: ['Flint', 'Ben', 'Tulcus'], need: 'Flint, Ben: Town Resident+' },
  { name: 'Bottomwear DEF Scroll: Lesser', price: 20000, soldBy: ['Flint', 'Ben', 'Tulcus'], need: 'Flint, Ben: Town Resident+' },
  { name: 'Hat Accuracy Scroll: Lesser', price: 20000, soldBy: ['Tulcus'] },
  { name: 'Hat HP Scroll: Lesser', price: 20000, soldBy: ['Tulcus'] },
  { name: 'Hat MP Scroll: Lesser', price: 20000, soldBy: ['Tulcus'] },
  { name: 'Shield DEF Scroll: Lesser', price: 20000, soldBy: ['Tulcus'] },
  { name: 'One-Handed Sword Attack Scroll: Lesser', price: 30000, soldBy: ['El Moth'] },
  { name: 'One-Handed Axe Attack Scroll: Lesser', price: 30000, soldBy: ['El Moth'] },
  { name: 'One-Handed Blunt Weapon Attack Scroll: Lesser', price: 30000, soldBy: ['El Moth'] },
  { name: 'Dagger Attack Scroll: Lesser', price: 30000, soldBy: ['El Moth'] },
  { name: 'Overall Armor DEX Scroll: Lesser', price: 40000, soldBy: ['Flint'], need: 'Distinguished Citizen+' },
  { name: 'Overall Armor STR Scroll: Lesser', price: 40000, soldBy: ['Flint'], need: 'Distinguished Citizen+' },
  { name: 'Earring Crit. Damage Scroll: Lesser', price: 40000, soldBy: ['Flint'], need: 'Helpful Stranger+' },
  { name: 'Gloves Attack Scroll: Lesser', price: 40000, soldBy: ['Flint', 'Ben'], need: 'Guardian of the Village+' },
  { name: 'Gloves Magic Attack Scroll: Lesser', price: 40000, soldBy: ['Flint', 'Ben'], need: 'Guardian of the Village+' },
  { name: 'Earring Evasion Scroll: Lesser', price: 40000, soldBy: ['Ben'], need: 'Helpful Stranger+' },
  { name: 'Overall Armor LUK Scroll: Lesser', price: 40000, soldBy: ['Ben'], need: 'Distinguished Citizen+' },
  { name: 'Overall Armor INT Scroll: Lesser', price: 40000, soldBy: ['Ben'], need: 'Distinguished Citizen+' },
  { name: 'Overall Armor DEF Scroll: Lesser', price: 40000, soldBy: ['Tulcus'] },
  { name: 'Shoes Evasion Scroll: Lesser', price: 40000, soldBy: ['Tulcus'] },
  { name: 'Cape Weapon Def. Scroll: Lesser', price: 40000, soldBy: ['Tulcus'] },
  { name: 'Cape Magic Def. Scroll: Lesser', price: 40000, soldBy: ['Tulcus'] },
  { name: 'Cape Accuracy Scroll: Lesser', price: 40000, soldBy: ['Tulcus'] },
  { name: 'Wand Magic Attack Scroll: Lesser', price: 60000, soldBy: ['El Moth'] },
  { name: 'Staff Magic Attack Scroll: Lesser', price: 60000, soldBy: ['El Moth'] },
  { name: 'Two-handed Sword Attack Scroll: Lesser', price: 60000, soldBy: ['El Moth'] },
  { name: 'Two-handed Axe Attack Scroll: Lesser', price: 60000, soldBy: ['El Moth'] },
  { name: 'Two-handed Blunt Weapon Attack Scroll: Lesser', price: 60000, soldBy: ['El Moth'] },
  { name: 'Spear Attack Scroll: Lesser', price: 60000, soldBy: ['El Moth'] },
  { name: 'Polearm Attack Scroll: Lesser', price: 60000, soldBy: ['El Moth'] },
  { name: 'Bow Attack Scroll: Lesser', price: 60000, soldBy: ['El Moth'] },
  { name: 'Crossbow Attack Scroll: Lesser', price: 60000, soldBy: ['El Moth'] },
  { name: 'Claw Attack Scroll: Lesser', price: 60000, soldBy: ['El Moth'] },
];

const byName = new Map(SHOP_PRICES.map((p) => [p.name.toLowerCase(), p]));

/** What a shop charges for this item, if we know. Unknown is not the same as "not sold". */
export const shopPriceFor = (item: Pick<Item, 'name'>) => byName.get(item.name.trim().toLowerCase());
