import { ITEMS } from '.';
import { CRATES, crateItem } from './cashShop';
import { matchOfferItem, nameIndex, type NamedItem } from '../calculators/chatPrices';
import type { ChatOffer } from '../integrations/expTrackerImport';

// Which game item each imported chat offer is about. Built from the item list plus the crate pieces
// (cash fashion items that aren't in the item list), so "S> Devil Horns 3m" finds its item too.

const PIECES: NamedItem[] = [...new Set(CRATES.flatMap((c) => c.rewards.map((r) => r.name)))].flatMap((name) => {
  const it = crateItem(name);
  return it ? [{ id: it.id, name }] : [];
});
const INDEX = nameIndex<NamedItem>([...ITEMS.filter((i) => i.name?.trim()), ...PIECES]);

const cache = new WeakMap<ChatOffer[], Map<ChatOffer, NamedItem | null>>();

/** The game item for each offer (null when the text names no item we know). Cached per offers list. */
export function offerItems(offers: ChatOffer[]): Map<ChatOffer, NamedItem | null> {
  let m = cache.get(offers);
  if (!m) {
    m = new Map(offers.map((o) => [o, matchOfferItem(o.item, [], INDEX)]));
    cache.set(offers, m);
  }
  return m;
}

/** Offers about one item id. */
export function offersFor(offers: ChatOffer[], itemId: number): ChatOffer[] {
  const m = offerItems(offers);
  return offers.filter((o) => m.get(o)?.id === itemId);
}
