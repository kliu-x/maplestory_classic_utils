import { useMemo, useState } from 'react';
import type { Item } from '../models/types';
import { IMG, ITEMS, itemById } from '../data';
import { CASH_PACKAGES, CASH_SOURCES, CRATES, type Crate, cashPriceFor, crateFor, crateItem, cratesWith, saleState, todayIso } from '../data/cashShop';
import { averageOpens, chanceInOpens, costOfOpens, opensForChance } from '../calculators/crate';
import { MarketLink } from '../components/MarketLink';
import { fmt, NumField, SourceBadge, StatusPill } from '../components/ui';
import { href } from '../router';
import type { PageProps } from './shared';

const CASH_ITEMS = ITEMS.filter((i) => i.cash);
const icon = (id?: number) =>
  id ? <img className="mob-icon" src={IMG.item(id)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : <span className="mob-icon" />;
const money = (n: number, currency = 'NX') => (Number.isFinite(n) ? `${fmt(n)} ${currency}` : '—');
const dateLabel = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: iso.startsWith('2026') ? undefined : 'numeric' });

export default function CashShop({ params }: PageProps) {
  const today = todayIso();
  const selected = params.get('id') ? itemById.get(Number(params.get('id'))) : undefined;
  const piece = params.get('piece') ?? '';
  const defaultCrate = (params.get('crate') && CRATES.find((c) => c.key === params.get('crate'))) || (selected && crateFor(selected.id, today)) || CRATES.find((c) => saleState(c, today) === 'on sale') || CRATES[0];
  const [crateKey, setCrateKey] = useState(defaultCrate.key);
  const crate = CRATES.find((c) => c.key === (params.get('crate') ?? crateKey)) ?? defaultCrate;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Cash Shop</h1>
          <p>NX prices and Mystery Fashion Crate rates as Nexon published them. Crate pieces can be traded, so "Market" opens their Free Market price in mesos on MeowDB.</p>
        </div>
      </div>

      {selected?.cash && <CashItemDetail item={selected} today={today} />}

      <CrateCard crate={crate} today={today} highlight={piece} onPick={(k) => { setCrateKey(k); if (params.get('crate')) window.location.hash = href('cash', { crate: k }); }} />

      <div className="card">
        <div className="card-head"><h2>Packages</h2><SourceBadge source={CASH_SOURCES.founders} compact /></div>
        <div className="grid grid-2">
          {CASH_PACKAGES.map((p) => (
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

      <CashItems selectedId={selected?.id} today={today} />
    </>
  );
}

function SaleTag({ crate, today }: { crate: Crate; today: string }) {
  const s = saleState(crate, today);
  if (s === 'on sale') return <span className="gear-tier affordable">on sale until {crate.sale.untilNote ?? dateLabel(crate.sale.until)}</span>;
  if (s === 'upcoming') return <span className="gear-tier accessible">from {dateLabel(crate.sale.from)}</span>;
  return <span className="gear-tier">ended {dateLabel(crate.sale.until)}</span>;
}

function CrateCard({ crate, today, highlight, onPick }: { crate: Crate; today: string; highlight: string; onPick: (key: string) => void }) {
  const [opens, setOpens] = useState(crate.price.bundle?.count ?? 10);
  const cur = crate.price.currency;
  const rows = [...crate.rewards].sort((a, b) => a.rate - b.rate || a.name.localeCompare(b.name));
  const rarest = rows[0];
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
        Rarest pieces are {rarest.rate}%: on average {fmt(averageOpens(rarest.rate))} crates (≈ {money(costOfOpens(averageOpens(rarest.rate), crate.price), cur)}), and a 50% chance takes {fmt(opensForChance(rarest.rate, 0.5))}.
        A duplicate or unwanted piece swaps for 1 Aurora Stamp before you equip it (20 stamps buy an Aurora crate).
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Piece</th><th className="num">Rate</th><th className="num">Chance in {fmt(opens)}</th><th className="num">50% chance</th><th className="num">Average</th><th className="num">Market</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const it = crateItem(r.name);
              const half = opensForChance(r.rate, 0.5);
              return (
                <tr key={r.name} className={highlight.toLowerCase() === r.name.toLowerCase() ? 'selected' : ''}>
                  <td>
                    <span className="mob-name">
                      {icon(it?.id)}
                      <span>
                        <strong>{r.name}</strong>
                        {it && <div className="small muted">{it.slot}</div>}
                      </span>
                    </span>
                  </td>
                  <td className="num">{r.rate}%</td>
                  <td className="num">{fmt(chanceInOpens(r.rate, opens) * 100)}%</td>
                  <td className="num" title={money(costOfOpens(half, crate.price), cur)}>{fmt(half)} <span className="small muted">({money(costOfOpens(half, crate.price), cur)})</span></td>
                  <td className="num">{fmt(averageOpens(r.rate))}</td>
                  <td className="num"><MarketLink item={{ id: it?.id ?? 0, name: r.name }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        "50% chance" is how many crates give a coin-flip chance of that piece (cost in brackets, buying {crate.price.bundle ? `${crate.price.bundle.count}-packs where cheaper` : 'singles'}). "Average" is 1 ÷ rate. Each crate is a fresh roll: opening more doesn't raise the rate.
        Sale dates: <SourceBadge source={crate.saleSource} compact /> {crate.saleSource.source_title}.
      </p>
    </div>
  );
}

function CashItems({ selectedId, today }: { selectedId?: number; today: string }) {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(false);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return CASH_ITEMS.filter((i) => (t ? i.name.toLowerCase().includes(t) : all || cashPriceFor(i) || crateFor(i.id, today)))
      .sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.name.localeCompare(b.name));
  }, [q, all, today]);
  return (
    <div className="card">
      <div className="card-head"><h2>Cash Shop items</h2><SourceBadge source={CASH_SOURCES.founders} compact /></div>
      <div className="row" style={{ alignItems: 'end' }}>
        <label className="field" style={{ flex: '1 1 200px' }}>
          Search
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Safety Charm, Megaphone, SP Reset" />
        </label>
        {!q && <label className="small"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Show items without a price ({CASH_ITEMS.length} in the game files)</label>}
      </div>
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr><th>Item</th><th className="num">Price</th><th>Lasts</th><th>What it does</th><th className="num">Market</th></tr>
          </thead>
          <tbody>
            {list.map((i) => {
              const p = cashPriceFor(i);
              const c = crateFor(i.id, today);
              return (
                <tr key={i.id} className={`clickable ${selectedId === i.id ? 'selected' : ''}`} onClick={() => (window.location.hash = href('cash', { id: i.id }))}>
                  <td>
                    <span className="mob-name">
                      {icon(i.id)}
                      <span><strong>{i.name}</strong><div className="small muted">{i.subCategory ?? i.category}</div></span>
                    </span>
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
              );
            })}
          </tbody>
        </table>
        {list.length === 0 && <div className="empty">No Cash Shop items match.</div>}
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
        <div className="kv"><div className="k">Market price</div><div className="v">{i.untradeable ? 'untradable' : <MarketLink item={i} label="See on MeowDB" />}</div></div>
      </div>
      {p && <p className="small">{p.note} <SourceBadge source={p.source} compact /></p>}
      {c && <p className="small">This is a random box: its rates are in the crate table below. <SaleTag crate={c} today={today} /></p>}
      {inCrates.length > 0 && <p className="small">In {inCrates.map((x) => `${x.crate.label} (${x.rate}%)`).join(', ')}.</p>}
    </div>
  );
}
