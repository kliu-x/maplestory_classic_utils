import { Fragment, useMemo, useState } from 'react';
import type { PageProps } from './shared';
import { TrackerImport } from '../components/TrackerImport';
import { PageFilter } from '../components/PageFilter';
import { fmt } from '../components/ui';
import { clearChatOffers, useChatOffers } from '../storage/chatOffers';
import { offerItems } from '../data/chatMarket';
import { shortMesos, summarizeAsks } from '../calculators/chatPrices';
import { matchesQuery } from '../calculators/textMatch';
import { itemById } from '../data';
import { href } from '../router';
import type { ChatOffer } from '../integrations/expTrackerImport';

// Buy/sell offers from the game's chat, read by the Maple EXP Tracker on the player's own PC and imported here.

type Side = 'all' | 'S' | 'B';

const priceText = (o: ChatOffer) => (o.price != null ? `${shortMesos(o.price)}${o.each ? ' each' : ''}` : o.pmo ? 'PMO' : '—');

export default function ChatMarket({ params }: PageProps) {
  const offers = useChatOffers();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [side, setSide] = useState<Side>('all');
  const [open, setOpen] = useState<string | null>(null);
  const items = offerItems(offers);

  const groups = useMemo(() => {
    const by = new Map<string, { key: string; label: string; itemId: number | null; offers: ChatOffer[] }>();
    for (const o of offers) {
      if (side !== 'all' && o.side !== side) continue;
      const it = items.get(o) ?? null;
      if (!matchesQuery(q, o.item, o.player, o.raw, it?.name)) continue;
      const key = it ? `id:${it.id}` : `text:${o.item.toLowerCase()}`;
      const g = by.get(key) ?? { key, label: it?.name ?? o.item, itemId: it?.id ?? null, offers: [] };
      g.offers.push(o);
      by.set(key, g);
    }
    const last = (g: { offers: ChatOffer[] }) => g.offers.map((o) => o.lastSeen ?? o.id).sort().pop() ?? '';
    return [...by.values()].sort((a, b) => last(b).localeCompare(last(a)));
  }, [offers, items, q, side]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Chat Market</h1>
          <p>Buy and sell offers (B&gt; / S&gt;) from the game's chat, read by the Maple EXP Tracker on your PC. These are asking prices, not what things sold for.</p>
        </div>
      </div>

      <div className="card">
        <TrackerImport />
        <p className="small muted" style={{ marginBottom: 0 }}>
          The Maple EXP Tracker is a separate Windows overlay (by a friend, built on beanguri's MIT-licensed EXP overlay). It reads only your screen. Whether the game's
          rules allow tools that read chat is your call. Offers stay in this browser; re-import any time, repeats are merged.
        </p>
      </div>

      {offers.length > 0 && (
        <>
          <div className="row" style={{ margin: '16px 0 0', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <PageFilter value={q} onChange={setQ} placeholder="Filter: item, player or message" shown={`${groups.length} item${groups.length === 1 ? '' : 's'}`} />
            </div>
            <div className="seg" role="group" aria-label="Side">
              {(['all', 'S', 'B'] as Side[]).map((s) => (
                <button key={s} className={side === s ? 'on' : ''} onClick={() => setSide(s)}>{s === 'all' ? 'All' : s === 'S' ? 'Selling' : 'Buying'}</button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Item</th><th className="num">Sellers ask</th><th className="num">Buyers bid</th><th className="num">Offers</th><th>Last seen</th></tr>
                </thead>
                <tbody>
                  {groups.map((g) => {
                    const s = summarizeAsks(g.offers);
                    const isOpen = open === g.key;
                    return (
                      <Fragment key={g.key}>
                        <tr className="clickable" onClick={() => setOpen(isOpen ? null : g.key)}>
                          <td>
                            <strong>{g.label}</strong>
                            {g.itemId != null && itemById.has(g.itemId) && (
                              <> <a className="small" href={href('items', { id: g.itemId })} onClick={(e) => e.stopPropagation()}>item ↗</a></>
                            )}
                            {g.itemId == null && <div className="small muted">as written; no matching item</div>}
                          </td>
                          <td className="num">{s.sellLow != null ? `${shortMesos(s.sellLow)}${s.sellMedian !== s.sellLow && s.sellMedian != null ? ` – mid ${shortMesos(s.sellMedian)}` : ''}` : s.sells ? 'PMO' : '—'}</td>
                          <td className="num">{s.buyHigh != null ? `up to ${shortMesos(s.buyHigh)}` : s.buys ? 'PMO' : '—'}</td>
                          <td className="num">{fmt(g.offers.length)}</td>
                          <td className="small">{s.lastSeen?.slice(5, 16)}</td>
                        </tr>
                        {isOpen &&
                          [...g.offers].reverse().slice(0, 30).map((o) => (
                            <tr key={o.id + o.player + o.side} className="sub-row">
                              <td className="small" colSpan={2}>
                                <span className={`pill ${o.side === 'S' ? 'solo' : 'party'}`}>{o.side === 'S' ? 'SELL' : 'BUY'}</span> {o.player || '?'}: <span className="muted">{o.raw || o.item}</span>
                              </td>
                              <td className="num small">{priceText(o)}</td>
                              <td className="num small">{o.count > 1 ? `seen ${o.count}×` : ''}</td>
                              <td className="small">{(o.lastSeen ?? o.id).slice(5, 16)}</td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {groups.length === 0 && <div className="empty">No offers match.</div>}
            </div>
            <p className="small muted" style={{ marginTop: 8 }}>
              {fmt(offers.length)} offers imported. An offer is tied to an item only when an item's full name is in what was written; otherwise it's listed as written.
              "Each" prices are per item. Player names can have "?" where the tracker hasn't learned a letter yet.{' '}
              <button className="link-btn small" onClick={() => confirm('Remove all imported chat offers from this browser?') && clearChatOffers()}>Clear all</button>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
