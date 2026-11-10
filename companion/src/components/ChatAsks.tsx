import { useMemo } from 'react';
import { offersFor } from '../data/chatMarket';
import { shortMesos, summarizeAsks } from '../calculators/chatPrices';
import { useChatOffers } from '../storage/chatOffers';
import { href } from '../router';

/** "Seen in chat: S> from 2.5m · B> up to 2m" for one item, from imported chat offers. Nothing when there are none. */
export function ChatAsks({ itemId, name }: { itemId: number; name: string }) {
  const offers = useChatOffers();
  const mine = useMemo(() => offersFor(offers, itemId), [offers, itemId]);
  if (!mine.length) return null;
  const s = summarizeAsks(mine);
  const parts = [
    s.sells ? `S> ${s.sellLow != null ? `from ${shortMesos(s.sellLow)}` : 'PMO'}${s.sellMedian != null && s.sellMedian !== s.sellLow ? ` (middle ${shortMesos(s.sellMedian)})` : ''}` : null,
    s.buys ? `B> ${s.buyHigh != null ? `up to ${shortMesos(s.buyHigh)}` : 'PMO'}` : null,
  ].filter(Boolean);
  return (
    <div className="small chat-asks">
      <strong>Seen in chat:</strong> {parts.join(' · ')}{' '}
      <span className="muted">
        ({mine.length} offer{mine.length === 1 ? '' : 's'}, {s.players} player{s.players === 1 ? '' : 's'}, last {s.lastSeen?.slice(0, 16)}). Asking prices, not sales.{' '}
        <a href={href('chat', { q: name })}>All offers</a>
      </span>
    </div>
  );
}
