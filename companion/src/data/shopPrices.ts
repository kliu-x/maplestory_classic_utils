// What NPC shops charge for potions, food, ammo, scrolls and equipment. Shop lists are server-side, so
// the game files can't tell us these; they come from MeowDB's tables of prices read in game.

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
  source_url: 'https://meowdb.com/msclassic/npc-shops/item-efficiency',
  source_title: 'MeowDB: Item Efficiency shop tables',
  retrieved_at: '2026-11-01',
  game_version_or_date: 'Classic World launch prices',
  verification_status: 'community_reported',
  notes: 'Fan database; prices read in game at launch, some in the second test. Some items may be missing.',
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

// Equipment, grouped by who sells it at what price. Only rows MeowDB's pages gave in full: the
// warrior and thief pages were cut off, so warrior pants and shoes and thief shoes can be missing.
const equip = (soldBy: string, price: number, names: string, notOpen?: boolean) =>
  names.split(', ').forEach((name) => SHOP_PRICES.push({ name, price, soldBy: soldBy.split(', '), ...(notOpen ? { notOpen } : {}) }));

const MANNY = 'Cutthroat Manny';
const FLORA = 'Flora the Fairy';
const SERABI = 'Serabi the Fairy';
const NERI_SCOTT = 'Neri the Fairy, Scott';
const NURI_RUMI = 'Nuri the Fairy, Rumi';

// Weapons
equip('Sid, Silver', 50, 'Wooden Club, Hand Axe');
equip('Sid, Silver, Karl', 50, 'Sword');
equip('Sid', 500, 'Razor');
equip('Silver', 1500, 'Fruit Knife');
equip('Silver', 3000, 'Steel Pipe, Double Axe');
equip(`Silver, River, ${MANNY}`, 3000, 'Long Sword');
equip('Karl', 3800, 'Leather Purse');
equip('Karl', 5000, 'Red Brick, Crossbow, War Bow');
equip('Karl', 7000, 'Battle Crossbow, Composite Bow');
equip('Karl', 10500, 'Hard Briefcase');
equip('Karl', 13500, "Plunger, Hunter's Bow, Balanche");
equip('Karl', 16500, 'Mountain Crossbow, Battle Bow');
equip(FLORA, 14700, 'Sky Blue Umbrella');
equip(FLORA, 3000, 'Wooden Wand, Wooden Staff');
equip(FLORA, 5000, 'Hardwood Wand, Sapphire Staff, Emerald Staff');
equip(FLORA, 10500, 'Metal Wand, Old Wooden Staff');
equip(FLORA, 13500, 'Ice Wand, Wizard Staff');
equip(`River, ${MANNY}`, 5000, 'Pole Arm, Wooden Mallet, Spear, Wooden Sword, Metal Axe, Field Dagger');
equip(`${FLORA}, River`, 5000, 'Mace');
equip('River', 5000, 'Sabre, Battle Axe');
equip(MANNY, 6200, 'Square Shovel');
equip('River', 7000, 'Iron Ball');
equip(`River, ${MANNY}`, 7000, 'Fork on a Stick');
equip(`${FLORA}, River`, 10500, 'Iron Mace');
equip('River', 10500, 'Viking Sword, Machete');
equip(`River, ${MANNY}`, 10500, 'Coconut Knife');
equip(MANNY, 11700, 'Pointed Shovel, Stinger');
equip('River', 13500, 'Mithril Axe, Eloon, Square Hammer, Studded Polearm, Two-Handed Sword, Iron Axe');
equip(`${FLORA}, River`, 13500, 'Fusion Mace');
equip(`River, ${MANNY}`, 13500, 'Iron Dagger');
equip('River', 16500, 'Broadsword, Two-Handed Axe, Heavy Mace');
equip(MANNY, 3000, 'Triangular Zamadar');
equip(MANNY, 5000, 'Garnier');
equip(MANNY, 5800, 'Triple-Tipped Zamadar');
equip(MANNY, 7000, 'Steel Titans');
equip(MANNY, 14100, 'Steel Igor');
equip(MANNY, 14700, 'Forked Dagger');
equip(MANNY, 16500, 'Meba');
equip(NERI_SCOTT, 22000, "War Hammer, Gladius, Fireman's Axe, Reef Claw, Mithril Wand", true);
equip('Neri the Fairy', 22000, 'Cass', true);
equip(NERI_SCOTT, 26000, 'Mithril Pole Arm, Scimitar, Mithril Maul, Forked Spear, Blue Axe, Steel Guards, Eagle Crow, Ryden', true);
equip('Scott', 30000, 'Cutlus, Dankke, Heavy Hammer, Halfmoon Zamadar, Wizard Wand', true);
equip('Scott', 36000, 'Sledgehammer, Axe Pole Arm, Nakamaki, Lionheart, Niam, Bronze Guardian, Heckler, Red Viper', true);

// Earrings and shield
equip('Sam', 4500, 'Single Earring, Amethyst Earrings');
equip(SERABI, 9000, 'Weighted Earrings, Yellow Square');
equip(SERABI, 11250, 'Gold Earrings');
equip('Silver', 2000, 'Stolen Fence');

// Hats
equip('Natasha, Don Hwang', 1200, 'White Bandana');
equip('Don Hwang', 1200, 'Red Bandana, Yellow Bandana, Black Bandana, Blue Bandana, Red Ghetto Beanie, Blue Ghetto Beanie, Brown Ghetto Beanie, Black Ghetto Beanie, Green Ghetto Beanie');
equip('Natasha, Sam', 600, 'Brown Skullcap');
equip('Natasha', 600, 'Red Headband, Black Headband, Green Headband, Yellow Headband, Blue Headband');
equip('Natasha', 900, 'Black Swimming Cap, Blue Swimming Cap, Red Swimming Cap');
equip('Natasha', 1800, 'Metal Gear');
equip('Don Hwang', 1900, 'Yellow Metal Gear, Red Thief Hood, Green Thief Hood, Blue Thief Hood, Yellow Thief Hood, Black Thief Hood');
equip('Don Hwang', 3600, 'Red Loosecap, Black Loosecap, Blue Loosecap, Brown Loosecap, Green Loosecap');
equip('Don Hwang', 4500, 'Red Tiberian, Dark Tiberian, Blue Tiberian, Brown Tiberian, Green Tiberian');
equip('Sam', 1200, 'Brown Winter Hat, Green Winter Hat');
equip('Sam', 1800, 'Green Feather Hat, Brown Feather Hat, Blue Feather Hat, Red Feather Hat, Black Feather Hat');
equip('Sam', 2000, 'Old Wisconsin');
equip('Sam', 3600, 'Green Robin Hat, Brown Robin Hat, Red Robin Hat, Blue Robin Hat, Black Robin Hat');
equip('Sam', 3900, 'Red Baseball Cap, Black Baseball Cap, Yellow Baseball Cap, Brown Baseball Cap, Blue Baseball Cap');
equip('Sam', 4500, 'Green Hunter, Brown Hunter, Red Hunter, Blue Hunter, Black Hunter');
equip(SERABI, 1200, 'Brown Apprentice Hat, Red Apprentice Hat, Blue Apprentice Hat');
equip(SERABI, 1800, 'Blue Moon Conehat, Pink Moon Conehat, Green Moon Conehat, Dark Moon Conehat, Brown Moon Conehat');
equip(SERABI, 3600, 'Blue Wizardry Hat, Red Wizardry Hat, Green Wizardry Hat');
equip('Harry', 1200, 'Bronze Koif');
equip('Harry', 1400, 'Bronze Helmet');
equip('Harry', 1800, 'Bronze Full Helm');
equip('Harry', 3600, 'Bronze Football Helmet, Bronze Viking Helm');
equip('Harry', 3900, 'Steel Sharp Helm');
equip('Harry', 4500, 'Iron Burgonet Helm');
equip(NURI_RUMI, 7200, 'Green Guise, Black Jester, Brown Hawkeye, Jousting Helmet', true);
equip('Rumi', 12000, 'Green Burgler, Green Matty, Brown Pole-Feather Hat, Great Brown Helmet', true);

// Overalls
equip(SERABI, 5400, 'Beige Plain Robe, Blue Plain Robe, Green Plain Robe');
equip(SERABI, 13500, 'Brown Doros Robe, Blue Doros Robe, Yellow Doros Robe, White Doros Robe, Brown Doroness Robe, Purple Doroness Robe, Red Doroness Robe');
equip('Harry', 5400, 'Steel Fitted Mail');
equip('Harry', 10800, 'Blue Kendo Robe, Red Kendo Robe, White Kendo Robe');
equip(NURI_RUMI, 21600, 'White Wizard Robe, Red Engrit', true);
equip('Rumi', 36000, 'Purple Avenger, Dark Chaos Robe, Silver Fitted Mail', true);

// Tops
equip('Pan', 50, 'White Undershirt, Grey T-Shirt, Undershirt, White Tube Top, Yellow T-Shirt, Green T-Shirt, Red Striped Top');
equip('Natasha', 2400, 'Blue One-lined T-Shirt, Orange Sporty T-Shirt, Pink Starry Shirt, Red Striped T-Shirt');
equip('Don Hwang', 2000, 'Red Cloth Vest, Blue Cloth Vest, Black Cloth Vest');
equip('Don Hwang', 3000, 'Blue Nightshift, Dark Nightshift, Red Nightshift, Brown Nightshift');
equip('Don Hwang', 6000, 'Red Pao, Blue Pao, Black Pao, Red Qi Pao, Pink Qi Pao, Blue Qi Pao');
equip('Don Hwang', 7500, 'Brown Sneak, Blue Sneak, Black Sneak, Blood Sneak, Sky Sneak, Gold Sneak, Dark Sneak');
equip(SERABI, 2000, 'Blue Training Shirt, Brown Training Shirt, Black Armine, Green Armine');
equip(SERABI, 3000, 'Purple Arianne, Green Arianne, Pink Arianne, Yellow Arianne');
equip(SERABI, 6000, 'Blue Split Piece, Orange Split Piece, Black Split Piece, Purple Split, Red Split, Black Split');
equip('Sam', 2000, 'Green Archer Top, Brown Archer Top, Green Avelin, Yellow Avelin');
equip('Sam', 3000, 'Green Leather Hoodwear, Silver Leather Hoodwear, Green Able Armor, Yellow Able Armor, Grey Able Armor');
equip('Sam', 6000, 'Brown Hard Leather Top, Green Shivermail, Red Shivermail, Purple Shivermail');
equip('Sam', 7500, 'Green Bennis Chainmail, Blue Bennis Chainmail, Red Bennis Chainmail, Black Bennis Chainmail, Yellow Bennis Chainmail');
equip('Harry', 2000, 'Brown Lolico Armor, Blue Lolico Armor, Orange Lolica Armor, Blueberry Lolica Armor');
equip('Harry', 3000, 'Brown Corporal, Steel Corporal');
equip('Harry', 6000, 'Blue Sergeant, Red Sergeant, Red Lamelle, Green Lamelle, Brown Lamelle');
equip('Harry', 7500, 'Silver Master Sergeant, Orihalcon Master Sergeant, Dark Master Sergeant, Blue Shark, Sky Shark, Red Shark');
equip(NURI_RUMI, 12000, "Dark Brown Stealer, Blue Steal, Purple Fairy Top, Red Hunter's Armor, Black Huntress Armor, Red Hwarang Shirt", true);
equip('Rumi', 20000, 'Green Knucklevest, Black Amoria Top, Brown Legolier, Brown Legolia, Blue Sky', true);

// Bottoms
equip('Pan', 50, 'Blue Jean Shorts, Brown Cotton Shorts, Red Miniskirt, Indigo Miniskirt');
equip('Natasha', 800, 'Jean Capris');
equip('Natasha', 1920, 'Grey Thick Sweat Pants');
equip('Don Hwang', 1600, 'Red Cloth Pants, Blue Cloth Pants, Black Cloth Pants');
equip('Don Hwang', 2400, 'Blue Nightshift Pants, Dark Nightshift Pants, Red Nightshift Pants, Brown Nightshift Pants');
equip('Don Hwang', 4800, 'Red Pao Bottoms, Blue Pao Bottoms, Black Pao Bottoms, Red Qi Pao Pants, Blue Qi Pao Pants, Purple Qi Pao Pants');
equip('Don Hwang', 5280, 'Red Qi Pao Skirt, Blue Qi Pao Skirt, Purple Qi Pao Skirt');
equip('Don Hwang', 6000, 'Brown Sneak Pants, Dark Brown Sneak Pants, Black Sneak Pants, Blood Sneak Pants, Sky Sneak Pants, Gold Sneak Pants');
equip('Don Hwang', 6240, 'Warfare Pants');
equip(SERABI, 1600, 'Blue Training Pants, Brown Training Pants, Black Armine Skirt, Green Armine Skirt');
equip(SERABI, 2400, 'Purple Arianne Skirt, Green Arianne Skirt, Pink Arianne Skirt, Yellow Arianne Skirt');
equip(SERABI, 4800, 'White Split Pants, Black Split Pants, White Split Skirt, Black Split Skirt');
equip('Sam', 1600, 'Archer Pants, Green Avelin Skirt, Yellow Avelin Skirt');
equip('Sam', 2400, 'Green Able Armor Skirt, Brown Able Skirt, Grey Able Skirt');
equip('Sam', 4800, 'Brown Hard Leather Pants, Green Shivermail Skirt, Red Shivermail Skirt, Purple Shivermail Skirt');
equip('Sam', 6000, 'Bennis Chain Pants');
equip(NURI_RUMI, 9600, "Purple Fairy Skirt, Red Hunter's Pants, Red Huntress Pants", true);
equip('Rumi', 16000, 'Black Amoria Skirt, Brown Legolier Pants, Brown Legolia Pants', true);

// Shoes
equip('Pan, Natasha', 50, 'Leather Sandals, Red Rubber Boots');
equip('Natasha', 50, 'Yellow Rubber Boots, Blue Rubber Boots');
equip('Natasha', 1920, 'Bronze Aroa Boots, Brown Aroa Boots, Green Aroa Boots');
equip('Natasha', 3780, 'Blue Ankle-strap Sandals, Red Ankle-strap Sandals, Brown Ankle-strap Sandals');
equip('Don Hwang', 1980, 'White Gomushin, Black Gomushin, Smelly Gomushin');
equip('Sam', 1200, 'Green Hard Leather Boots, Brown Hard Leather Boots');
equip('Sam', 1800, 'Green Woodsman Boots, Brown Woodsman Boots, Blue Woodsman Boots');
equip('Sam', 3600, 'Deer Huntertop, Rabbit Huntertop, Bear Huntertop, Lion Huntertop');
equip('Sam', 4680, 'Red Whitebottom Boots, Orange Whitebottom Boots, Pink Whitebottom Boots, Blue Whitebottom Boots');
equip(SERABI, 1200, 'Brown Basic Boots, Yellow Basic Boots, Blue Basic Boots');
equip(SERABI, 1800, 'Beige Nitty, Black Nitty');
equip(SERABI, 3600, 'Blue Jewelry Boots, Purple Jewelry Boots, Red Jewelry Boots');
equip(SERABI, 4500, 'Silver Wind Shoes, Yellow Wind Shoes, Black Wind Shoes');
equip('Rumi', 3600, 'Blue Snowshoes, Green Snowshoes', true);

const byName = new Map(SHOP_PRICES.map((p) => [p.name.toLowerCase(), p]));

/** What a shop charges for this item, if we know. Unknown is not the same as "not sold". */
export const shopPriceFor = (item: Pick<Item, 'name'>) => byName.get(item.name.trim().toLowerCase());
