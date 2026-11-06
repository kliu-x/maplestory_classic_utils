import { useMemo, useState } from 'react';
import type { Item } from '../models/types';
import { IMG, ITEMS, QUESTS, itemById } from '../data';
import { JOBS } from '../data/rules';
import { COST_LABEL, GEAR_SOURCES, TIER_LABEL } from '../data/gearGuide';
import { BASE_STATS, STAT_LABEL, gearPicksFor, jobsOf, questsFor, sortedStats, statLine, usableBy } from '../data/itemInfo';
import { DROP_REPORTS } from '../data/dropReports';
import { SHOP_PRICE_SOURCE, shopPriceFor } from '../data/shopPrices';
import { Droppers } from '../components/QuestDetail';
import { MarketLink } from '../components/MarketLink';
import { ItemHover } from '../components/ItemHover';
import { fmt, NumField, SourceBadge, StatusPill } from '../components/ui';
import { href } from '../router';
import { useActive, type PageProps } from './shared';

const KINDS = ['Weapon', 'Armor', 'Accessory', 'Usable', 'Other'] as const;
const USABLE = ['Consumable', 'Armor Scroll', 'Weapon Scroll', 'Projectile', 'Character Modification'];
const kindOf = (i: Item) => (i.category?.includes('Weapon') ? 'Weapon' : i.category === 'Armor' ? 'Armor' : i.category === 'Accessory' ? 'Accessory' : USABLE.includes(i.category ?? '') ? 'Usable' : 'Other');
const FAMILIES = ['Warrior', 'Magician', 'Bowman', 'Thief'];

export default function Items({ params }: PageProps) {
  const { character: c } = useActive();
  const selected = params.get('id') ? itemById.get(Number(params.get('id'))) : undefined;
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<string>('Weapon');
  const [family, setFamily] = useState<string>(c && FAMILIES.includes(JOBS[c.job].family) ? JOBS[c.job].family : '');
  const [maxLv, setMaxLv] = useState<number>(c ? c.level + 5 : 50);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return ITEMS.filter(
      (i) => !i.cash && (t ? i.name.toLowerCase().includes(t) : kindOf(i) === kind && (!family || usableBy(i, family)) && (i.reqLevel ?? 0) <= maxLv),
    ).sort((a, b) => (b.reqLevel ?? 0) - (a.reqLevel ?? 0) || a.name.localeCompare(b.name));
  }, [q, kind, family, maxLv]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Items</h1>
          <p>Stats from the Classic World files; prices and where to get them from guides and player reports.</p>
        </div>
      </div>

      {selected && <ItemDetail item={selected} />}

      <div className="card">
        <div className="row" style={{ alignItems: 'end' }}>
          <label className="field" style={{ flex: '1 1 200px' }}>
            Search all items
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Unagi, Ice Wand, Firewood" />
          </label>
          {!q && (
            <>
              <div className="seg">
                {KINDS.map((k) => <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{k}</button>)}
              </div>
              <label className="field">
                Class
                <select value={family} onChange={(e) => setFamily(e.target.value)}>
                  <option value="">any</option>
                  {FAMILIES.map((f) => <option key={f}>{f}</option>)}
                </select>
              </label>
              <NumField label="Up to level" value={maxLv} min={0} max={200} width={70} onChange={setMaxLv} />
            </>
          )}
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr><th>Item</th><th className="num">Lv</th><th>Stats / effect</th><th className="num">Shop price</th><th className="num">Market</th><th className="num">NPC buys for</th></tr>
          </thead>
          <tbody>
            {list.slice(0, 300).map((i) => (
              <tr key={i.id} className={`clickable ${selected?.id === i.id ? 'selected' : ''}`} onClick={() => (window.location.hash = href('items', { id: i.id }))}>
                <td>
                  <ItemHover item={i}>
                    <span className="mob-name">
                      <img className="mob-icon" src={IMG.item(i.id)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                      <span>
                        <strong>{i.name}</strong>
                        <div className="small muted">{[i.subCategory ?? i.category, jobsOf(i.reqJob).join('/')].filter(Boolean).join(' · ')}</div>
                      </span>
                    </span>
                  </ItemHover>
                  {gearPicksFor(i).length > 0 && <span className="gear-tier bis">guide pick</span>}
                </td>
                <td className="num">{i.reqLevel ?? '—'}</td>
                <td className="small">{statLine(i) || <span className="muted">{i.description?.slice(0, 80)}</span>}</td>
                <td className={`num ${shopPriceFor(i)?.notOpen ? 'muted' : ''}`} title={shopPriceFor(i)?.notOpen ? 'Its sellers are not open in this release' : undefined}>{shopPriceFor(i) ? fmt(shopPriceFor(i)!.price) : '—'}</td>
                <td className="num"><MarketLink item={i} /></td>
                <td className="num">{i.sellPrice ? fmt(i.sellPrice) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="empty">No items match.</div>}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        Equipment up to Lv 50, usable items and every quest item. "Shop price" is what a shop charges (from MeowDB; grey means its sellers aren't open yet, and — means we don't have it, not that no shop sells it). "Market" opens MeowDB's Free Market price; if it opens the price search, the name is already copied, so just paste it. "NPC buys for" is what a shop pays you.
      </p>
    </>
  );
}

function ItemDetail({ item: i }: { item: Item }) {
  const picks = gearPicksFor(i);
  const { rewards, needs } = questsFor(i.id, QUESTS);
  const reported = DROP_REPORTS.some((r) => r.itemId === i.id);
  const isEquip = !!i.category && i.category !== 'Etc';
  const shop = shopPriceFor(i);
  return (
    <div className="card">
      <div className="card-head">
        <h2>
          <img className="mob-icon big" src={IMG.item(i.id)} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> {i.name}
        </h2>
        <a className="btn small" href={href('items')}>Close</a>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        {[i.category, i.subCategory].filter(Boolean).join(' · ')}
        {i.untradeable && ' · untradeable'}
        {i.questItem && ' · quest item'} · item {i.id} <StatusPill status="verified" title="Stats from the Classic World game files (maplestory.io MCW v1)" />
      </p>
      {i.description && <p style={{ marginTop: 0 }}>{i.description}</p>}

      <div className="grid grid-2">
        <div>
          <h3>Stats</h3>
          <div className="detail-grid">
            {i.reqLevel != null && <div className="kv"><div className="k">Required level</div><div className="v">{i.reqLevel}</div></div>}
            {jobsOf(i.reqJob).length > 0 && <div className="kv"><div className="k">Class</div><div className="v">{jobsOf(i.reqJob).join(', ')}</div></div>}
            {Object.entries(i.req ?? {}).map(([k, v]) => <div key={k} className="kv"><div className="k">Needs {k.toUpperCase()}</div><div className="v">{v}</div></div>)}
            {sortedStats(i.stats).map(([k, v]) => <div key={k} className="kv"><div className="k">{STAT_LABEL[k] ?? k}</div><div className="v">{v > 0 && !BASE_STATS.includes(k) ? '+' : ''}{v}</div></div>)}
            {i.attackSpeed != null && <div className="kv"><div className="k">Attack speed</div><div className="v">{i.attackSpeed}</div></div>}
            {i.slots != null && <div className="kv"><div className="k">Upgrade slots</div><div className="v">{i.slots}</div></div>}
            <div className="kv"><div className="k">Market price</div><div className="v"><MarketLink item={i} /></div></div>
            <div className="kv"><div className="k">NPC buys it for</div><div className="v">{i.sellPrice ? `${fmt(i.sellPrice)} mesos` : '—'}</div></div>
          </div>
          {!isEquip && !i.stats && <p className="small muted">No stats: not equipment.</p>}
        </div>

        <div>
          <h3>Where to get it</h3>
          {shop && (
            <p className="small" style={{ margin: '0 0 8px' }}>
              <strong>Shop price:</strong> {fmt(shop.price)} mesos <SourceBadge source={SHOP_PRICE_SOURCE} compact />
              <br />
              {shop.notOpen ? <>Its sellers ({shop.soldBy.join(', ')}) aren't open in this release.</> : <>Sold by {shop.soldBy.join(', ')}.</>}
              {shop.need && <> <span className="muted">Needs {shop.need}.</span></>}
            </p>
          )}
          {picks.length > 0 && (
            <div className="stack" style={{ gap: 6, marginBottom: 10 }}>
              {picks.map((p, k) => (
                <div key={k} className="gear-pick">
                  <div className="gear-pick-head">
                    <span className={`gear-tier ${p.tier}`}>{TIER_LABEL[p.tier]} at Lv {p.level}</span>
                    <span className="spacer" />
                    <span className="gear-cost" title={p.costNote ?? undefined}>
                      {p.estCost != null ? (p.estCost === 0 ? 'free' : `~${fmt(p.estCost)}`) : 'price ?'}
                      {p.costKind && p.estCost !== 0 && <span className="muted small"> {COST_LABEL[p.costKind]}</span>}
                    </span>
                  </div>
                  <div className="small">
                    {p.howToGet && p.howToGet !== 'Not stated' ? p.howToGet : 'Guides don\'t say where to get it.'}{' '}
                    {p.sourceIds.map((id) => GEAR_SOURCES[id] && <SourceBadge key={id} source={GEAR_SOURCES[id]} compact />)}
                  </div>
                  {p.conflict && <div className="small"><StatusPill status="conflicting" /> {p.conflict}</div>}
                </div>
              ))}
            </div>
          )}
          {rewards.length > 0 && (
            <p className="small" style={{ margin: '0 0 8px' }}>
              <strong>Quest reward:</strong> {rewards.map((q) => <a key={q.id} href={href('quests', { id: q.id })} style={{ marginRight: 8 }}>{q.name} (Lv {q.minLevel || 1})</a>)}
            </p>
          )}
          {needs.length > 0 && (
            <p className="small" style={{ margin: '0 0 8px' }}>
              <strong>Quests that need it:</strong> {needs.map((q) => <a key={q.id} href={href('quests', { id: q.id })} style={{ marginRight: 8 }}>{q.name}</a>)}
            </p>
          )}
          <div className="small" style={{ marginBottom: 4 }}><strong>Drops</strong></div>
          <Droppers itemId={i.id} />
          {!picks.length && !rewards.length && !reported && !shop && (
            <p className="small muted">Shop lists and drop tables aren't in the game files. If you've seen where it drops or who sells it, tell me and it'll be added as a player report.</p>
          )}
        </div>
      </div>
    </div>
  );
}
