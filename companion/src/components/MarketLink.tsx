import type { Item } from '../models/types';
import { marketLink } from '../data/itemInfo';

/** Opens MeowDB's Free Market price. Without a direct page, copies the name for its search box. */
export function MarketLink({ item, label = 'Check' }: { item: Pick<Item, 'id' | 'name'>; label?: string }) {
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
  );
}
