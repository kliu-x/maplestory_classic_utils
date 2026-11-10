import { Fragment, useMemo, useState } from 'react';
import type { Item } from '../models/types';
import { IMG, ITEMS, itemById } from '../data';
import { CASH_GROUPS, CASH_PACKAGES, CASH_SOURCES, CRATES, cashGroupOf, type Crate, cashPriceFor, crateFor, crateItem, cratesWith, saleState, todayIso } from '../data/cashShop';
import { chanceInOpens } from '../calculators/crate';
import { MarketLink } from '../components/MarketLink';
import { ChatAsks } from '../components/ChatAsks';
import { PageFilter } from '../components/PageFilter';
import { ItemHover } from '../components/ItemHover';
import { matchesQuery } from '../calculators/textMatch';
import { fmt, NumField, SourceBadge, StatusPill } from '../components/ui';
import { href } from '../router';
import type { PageProps } from './shared';

const CASH_ITEMS = ITEMS.filter((i) => i.cash);
const icon = (id?: number) =>
  id ? <img className="mob-icon" src={IMG.item(id)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : <span className="mob-icon" />;
const money = (n: number, currency = 'NX') => (Number.isFinite(n) ? `${fmt(n)} ${currency}` : '—');
const pieceMatches = (q: string, name: string) => matchesQuery(q, name, crateItem(name)?.slot);
const packageMatches = (q: string, p: (typeof CASH_PACKAGES)[number]) => matchesQuery(q, p.name, ...p.contains);
const itemMatches = (q: string, i: Item) => matchesQuery(q, i.name, i.category, i.subCategory, cashPriceFor(i)?.note, i.description);
const dateLabel = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: iso.startsWith('2026') ? undefined : 'numeric' });

export default function CashShop({ params }: PageProps) {
  const today = todayIso();
  const selected = params.get('id') ? itemById.get(Number(params.get('id'))) : undefined;
  const piece = params.get('piece') ?? '';
  const defaultCrate = (params.get('crate') && CRATES.find((c) => c.key === params.get('crate'))) || (selected && crateFor(selected.id, today)) || CRATES.find((c) => saleState(c, today) === 'on sale') || CRATES[0];
  const [crateKey, setCrateKey] = useState(defaultCrate.key);
  const picked = CRATES.find((c) => c.key === (params.get('crate') ?? crateKey)) ?? defaultCrate;
  const [q, setQ] = useState('');
  // Filtering for a piece that isn't in the picked crate shows the crate it's in (current sales first).
  const hits = (c: Crate) => c.rewards.some((r) => pieceMatches(q, r.name));
  const saleRank = (c: Crate) => ({ 'on sale': 0, upcoming: 1, ended: 2 })[saleState(c, today)];
  // A crate button clicked for this same filter wins.
  const [pickedFor, setPickedFor] = useState<string | null>(null);
  const crate = q.trim() && pickedFor !== q && !hits(picked) ? [...CRATES].sort((a, b) => saleRank(a) - saleRank(b)).find(hits) ?? picked : picked;
  const packages = CASH_PACKAGES.filter((p) => packageMatches(q, p));
  const matched = q.trim() ? PIECES.filter((x) => pieceMatches(q, x.name)).length + packages.length + CASH_ITEMS.filter((i) => itemMatches(q, i)).length : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cash Shop</h1>
          <p>NX prices and Mystery Fashion Crate rates as Nexon published them. Crate pieces can be traded, so "Market" opens their Free Market price in mesos on MeowDB.</p>
        </div>
      </div>

      <PageFilter value={q} onChange={setQ} placeholder="Filter this page: a piece, package or item (e.g. bear, megaphone)" shown={`${matched} match${matched === 1 ? '' : 'es'}`} />

      {selected?.cash && <CashItemDetail item={selected} today={today} />}

      <CrateCard crate={crate} today={today} highlight={piece} filter={q} onPick={(k) => { setCrateKey(k); setPickedFor(q); if (params.get('crate')) window.location.hash = href('cash', { crate: k }); }} />

      {packages.length > 0 && (
      <div className="card">
        <div className="card-head"><h2>Packages</h2><SourceBadge source={CASH_SOURCES.founders} compact /></div>
        <div className="grid grid-2">
          {packages.map((p) => (
            <div key={p.name} className="gear-pick">
              <div className="gear-pick-head">
                <strong>{p.name}</strong>
                <span className="spacer" />
                <span className="gear-cost">{fmt(p.nx)} NX <span className="muted small" style={{ textDecoration: 'line-through' }}>{fmt(p.was)}</span></span>
              </div>
              <div className="small">{p.contains.join(' · ')}</div>
              <div className="small muted">{p.limit}. Untradable.</div>
            </div>
          ))}
        </div>
      </div>
      )}

      <CashItems selectedId={selected?.id} today={today} q={q} />
    </>
  );
}

function SaleTag({ crate, today }: { crate: Crate; today: string }) {
  const s = saleState(crate, today);
  if (s === 'on sale') return <span className="gear-tier affordable">on sale until {crate.sale.untilNote ?? dateLabel(crate.sale.until)}</span>;
  if (s === 'upcoming') return <span className="gear-tier accessible">from {dateLabel(crate.sale.from)}</span>;
  return <span className="gear-tier">ended {dateLabel(crate.sale.until)}</span>;
}

function CrateCard({ crate, today, highlight, onPick, filter }: { crate: Crate; today: string; highlight: string; onPick: (key: string) => void; filter: string }) {
  const [opens, setOpens] = useState(crate.price.bundle?.count ?? 10);
  const cur = crate.price.currency;
  const sorted = [...crate.rewards].sort((a, b) => a.rate - b.rate || a.name.localeCompare(b.name));
  const rarest = sorted[0];
  const rows = sorted.filter((r) => pieceMatches(filter, r.name));
  const hitsIn = (c: Crate) => c.rewards.filter((r) => pieceMatches(filter, r.name)).length;
  const total = crate.rewards.reduce((s, r) => s + r.rate, 0);
  return (
    <div className="card">
      <div className="card-head">
        <h2>{icon(crate.itemId)} Mystery Fashion Crates</h2>
      </div>
      <div className="seg" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
        {CRATES.map((c) => (
          <button key={c.key} className={c.key === crate.key ? 'on' : ''} onClick={() => onPick(c.key)}>
            {c.label}{saleState(c, today) === 'on sale' ? ' ●' : ''}
            {filter.trim() && <span className={`step-pill ${hitsIn(c) ? '' : 'muted'}`} style={{ marginLeft: 6, marginRight: 0 }}>{hitsIn(c)}</span>}
          </button>
        ))}
      </div>

      <div className="row" style={{ alignItems: 'end', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div><strong>{crate.label}</strong> <SaleTag crate={crate} today={today} /></div>
          <div className="small">
            {money(crate.price.one, cur)} each{crate.price.bundle && <> · {crate.price.bundle.count} for {money(crate.price.bundle.price, cur)}</>} · one random piece out of {crate.rewards.length}
          </div>
          <div className="small muted">
            Rates: <SourceBadge source={crate.source} /> {Math.abs(total - 100) > 0.01 && <StatusPill status="conflicting" title={`Rates add up to ${total}%`} />}
          </div>
        </div>
        <span className="spacer" />
        <NumField label="If I open" value={opens} min={1} max={1000} width={70} onChange={setOpens} />
      </div>

      <p className="small" style={{ margin: '10px 0' }}>
        The rarest pieces are {rarest.rate}% each.
        A duplicate or unwanted piece swaps for 1 Aurora Stamp before you equip it (20 stamps buy an Aurora crate).
      </p>

      <p className="small muted" style={{ margin: '0 0 6px' }}>Each piece: drop rate · chance in {fmt(opens)} crates · market prices. Hover a piece to see it.</p>
      <div className="piece-grid">
        {rows.map((r) => {
          const it = crateItem(r.name);
          const item: Item | undefined = it && (itemById.get(it.id) ?? { id: it.id, name: r.name, subCategory: it.slot, cash: true });
          return (
            <div key={r.name} className={`piece-row ${highlight.toLowerCase() === r.name.toLowerCase() ? 'selected' : ''}`}>
              <ItemHover item={item}>
                <span className="mob-name piece-name">
                  {icon(it?.id)}
                  <strong>{r.name}</strong>
                </span>
              </ItemHover>
              <span className="num">{r.rate}%</span>
              <span className="num muted" title={`Chance of at least one in ${fmt(opens)} crates`}>{fmt(chanceInOpens(r.rate, opens) * 100)}%</span>
              <span className="num small"><MarketLink item={{ id: it?.id ?? 0, name: r.name, cash: true }} /></span>
            </div>
          );
        })}
      </div>
      <div>
        {rows.length === 0 && <div className="empty">No piece in {crate.label} matches "{filter.trim()}".{CRATES.some((c) => hitsIn(c)) ? ' The numbers on the crate buttons show where it is.' : ''}</div>}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        The second number is the chance of getting that piece at least once in {fmt(opens)} crates. Each crate is a fresh roll: opening more doesn't raise the rate.
        Sale dates: <SourceBadge source={crate.saleSource} compact /> {crate.saleSource.source_title}.
      </p>
    </div>
  );
}

/** Every crate piece once (a piece can be in several crates), as an item for the table. */
const PIECES = [...new Map(CRATES.flatMap((c) => c.rewards).map((r) => [r.name.toLowerCase(), r.name])).values()].map((name) => {
  const it = crateItem(name);
  const item: Item = (it && itemById.get(it.id)) || { id: it?.id ?? 0, name, subCategory: it?.slot, cash: true };
  return { name, item };
});
const PIECE_GROUP = 'Fashion: Mystery Fashion Crate pieces';

const groupRank = (i: Item) => { const n = CASH_GROUPS.findIndex((g) => g.name === cashGroupOf(i)); return n < 0 ? CASH_GROUPS.length : n; };

function CashItems({ selectedId, today, q }: { selectedId?: number; today: string; q: string }) {
  const [all, setAll] = useState(false);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return CASH_ITEMS.filter((i) => (t ? itemMatches(q, i) : all || cashPriceFor(i) || crateFor(i.id, today)))
      .sort((a, b) => groupRank(a) - groupRank(b) || a.name.localeCompare(b.name));
  }, [q, all, today]);
  const pieces = useMemo(() => (q.trim() || all ? PIECES.filter((x) => pieceMatches(q, x.name)).sort((a, b) => a.name.localeCompare(b.name)) : []), [q, all]);
  return (
    <div className="card">
      <div className="card-head"><h2>Cash Shop items</h2><SourceBadge source={CASH_SOURCES.founders} compact /></div>
      {q.trim() ? (
        <p className="small muted" style={{ margin: 0 }}>Searching all {CASH_ITEMS.length} Cash Shop items in the game files and all {PIECES.length} crate pieces.</p>
      ) : (
        <label className="small"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show everything: items without a price ({CASH_ITEMS.length} in the game files) and all {PIECES.length} crate pieces</label>
      )}
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr><th>Item</th><th className="num">Price</th><th>Lasts</th><th>What it does</th><th className="num">Market</th></tr>
          </thead>
          <tbody>
            {list.map((i, k) => {
              const p = cashPriceFor(i);
              const c = crateFor(i.id, today);
              const group = cashGroupOf(i);
              return (
                <Fragment key={i.id}>
                {(k === 0 || cashGroupOf(list[k - 1]) !== group) && (
                  <tr className="group-row"><td colSpan={5}>{group}</td></tr>
                )}
                <tr className={`clickable ${selectedId === i.id ? 'selected' : ''}`} onClick={() => (window.location.hash = href('cash', { id: i.id }))}>
                  <td>
                    <ItemHover item={i}>
                      <span className="mob-name">
                        {icon(i.id)}
                        <span><strong>{i.name}</strong><div className="small muted">{i.subCategory ?? i.category}</div></span>
                      </span>
                    </ItemHover>
                  </td>
                  <td className="num">
                    {p ? money(p.nx) : c ? money(c.price.one, c.price.currency) : '—'}
                    {p?.bundles && <div className="small muted">{p.bundles.map((b) => `${b.count} for ${fmt(b.nx)}`).join(' · ')}</div>}
                    {p?.until && <div className="small muted">until {dateLabel(p.until)}</div>}
                  </td>
                  <td className="small">{p?.duration ?? (c ? '7 days' : '—')}</td>
                  <td className="small">{p?.note ?? <span className="muted">{i.description?.slice(0, 90)}</span>}</td>
                  <td className="num">{i.untradeable ? <span className="muted small">untradable</span> : <MarketLink item={i} />}</td>
                </tr>
                </Fragment>
              );
            })}
            {pieces.length > 0 && <tr className="group-row"><td colSpan={5}>{PIECE_GROUP}</td></tr>}
            {pieces.map(({ name, item }) => {
              const where = cratesWith(name, today);
              const first = where[0];
              return (
                <tr
                  key={'piece:' + name}
                  className="clickable"
                  onClick={() => first && (window.location.hash = href('cash', { crate: first.crate.key, piece: name }))}
                >
                  <td>
                    <ItemHover item={item.id ? item : undefined}>
                      <span className="mob-name">
                        {icon(item.id || undefined)}
                        <span><strong>{name}</strong><div className="small muted">{crateItem(name)?.slot ?? 'Fashion'}</div></span>
                      </span>
                    </ItemHover>
                  </td>
                  <td className="num small">{first ? <>random from a crate<div className="muted">{money(first.crate.price.one, first.crate.price.currency)} a crate</div></> : '—'}</td>
                  <td className="small">—</td>
                  <td className="small">
                    {where.map((x) => (
                      <div key={x.crate.key}>{x.rate}% in {x.crate.label}{saleState(x.crate, today) === 'on sale' ? ' (on sale)' : ''}</div>
                    ))}
                  </td>
                  <td className="num"><MarketLink item={{ id: item.id, name, cash: true }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && pieces.length === 0 && <div className="empty">No Cash Shop items or crate pieces match.</div>}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        Prices from Nexon's Cash Shop posts (Founder's Access, Grand Launch and Nov 4). — means Nexon's posts don't list it right now, not that it's free. Items bought with NX are often untradable; the crates and their pieces are tradable.
      </p>
    </div>
  );
}

function CashItemDetail({ item: i, today }: { item: Item; today: string }) {
  const p = cashPriceFor(i);
  const c = crateFor(i.id, today);
  const inCrates = cratesWith(i.name, today);
  return (
    <div className="card">
      <div className="card-head">
        <h2><img className="mob-icon big" src={IMG.item(i.id)} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> {i.name}</h2>
        <a className="btn small" href={href('cash')}>Close</a>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        {[i.category, i.subCategory].filter(Boolean).join(' · ')}{i.untradeable && ' · untradable'} · item {i.id} <StatusPill status="verified" title="From the Classic World game files (maplestory.io MCW v1)" />
      </p>
      {i.description && <p style={{ marginTop: 0 }}>{i.description}</p>}
      <div className="detail-grid">
        <div className="kv"><div className="k">Cash Shop price</div><div className="v">{p ? money(p.nx) : c ? money(c.price.one, c.price.currency) : 'not in Nexon\'s current posts'}</div></div>
        {p?.bundles && <div className="kv"><div className="k">Multi-buy</div><div className="v">{p.bundles.map((b) => `${b.count} for ${fmt(b.nx)} NX`).join(' · ')}</div></div>}
        {p && <div className="kv"><div className="k">Lasts</div><div className="v">{p.duration}</div></div>}
        {p?.until && <div className="kv"><div className="k">On sale until</div><div className="v">{dateLabel(p.until)}</div></div>}
        <div className="kv"><div className="k">Market price</div><div className="v">{i.untradeable ? 'untradable' : <><MarketLink item={i} /><ChatAsks itemId={i.id} name={i.name} /></>}</div></div>
      </div>
      {p && <p className="small">{p.note} <SourceBadge source={p.source} compact /></p>}
      {c && <p className="small">This is a random box: its rates are in the crate table below. <SaleTag crate={c} today={today} /></p>}
      {inCrates.length > 0 && <p className="small">In {inCrates.map((x) => `${x.crate.label} (${x.rate}%)`).join(', ')}.</p>}
    </div>
  );
}
