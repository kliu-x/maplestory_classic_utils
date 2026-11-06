import type { Item } from '../models/types';
import { marketLink, mesoWatchLink } from '../data/itemInfo';

/** Free Market price links: MesoWatch (opens the item) and MeowDB (its page, or its search with the name copied). */
export function MarketLink({ item, label = 'MeowDB' }: { item: Pick<Item, 'id' | 'name' | 'cash'>; label?: string }) {
  const { url, direct } = marketLink(item as Item);
  const copy = () => {
    if (direct) return;
    try {
      void navigator.clipboard?.writeText(item.name.trim());
    } catch {
      // Clipboard blocked: the search still opens, the user types the name.
    }
  };
  return (
    <span className="market-links">
      <a href={mesoWatchLink(item)} target="_blank" rel="noreferrer" title={`${item.name} on MesoWatch: recent sales and listings`} onClick={(e) => e.stopPropagation()}>
        MesoWatch ↗
      </a>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title={direct ? `${item.name} on MeowDB` : `Copies "${item.name.trim()}" and opens MeowDB's price search: paste it there`}
        onClick={(e) => {
          e.stopPropagation();
          copy();
        }}
      >
        {label} ↗
      </a>
    </span>
  );
}
