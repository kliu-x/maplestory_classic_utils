import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Item } from '../models/types';
import { IMG } from '../data';
import { jobsOf, statLine } from '../data/itemInfo';
import { shopPriceFor } from '../data/shopPrices';
import { cashPriceFor, cratesWith, todayIso } from '../data/cashShop';
import { fmt } from './ui';

/**
 * Hovering (or focusing) the wrapped name shows the item's details in a small floating card,
 * like the in-game tooltip. Drawn on <body> so table edges don't cut it off. Touch screens
 * get nothing extra: tapping still opens the full item page.
 */
export function ItemHover({ item, children }: { item: Item | undefined; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<number>();
  const [at, setAt] = useState<{ x: number; y: number; below: boolean } | null>(null);
  if (!item) return <>{children}</>;
  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      // Above the name when there's room, else below; kept inside the window.
      const below = r.top < 260;
      setAt({ x: Math.min(Math.max(8, r.left), window.innerWidth - 300), y: below ? r.bottom + 6 : r.top - 6, below });
    }, 150);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setAt(null);
  };
  return (
    <span ref={ref} className="item-hover" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {at &&
        createPortal(
          <div className={`item-tip ${at.below ? 'below' : ''}`} style={{ left: at.x, top: at.y }} role="tooltip">
            <ItemCard item={item} />
          </div>,
          document.body,
        )}
    </span>
  );
}

/** The client's text keeps escaped line breaks ("\r") and format codes ("%d"). */
const cleanText = (t: string) => t.replace(/\\[rn]/g, ' ').replace(/\s*\(currently: %d[^)]*\)/g, '').replace(/\s{2,}/g, ' ');

function ItemCard({ item: i }: { item: Item }) {
  const shop = shopPriceFor(i);
  const cash = i.cash ? cashPriceFor(i) : undefined;
  const crates = i.cash ? cratesWith(i.name, todayIso()) : [];
  const stats = statLine(i);
  const needs = [
    i.reqLevel ? `Lv ${i.reqLevel}` : '',
    jobsOf(i.reqJob).join('/'),
    ...Object.entries(i.req ?? {}).map(([k, v]) => `${k.toUpperCase()} ${v}`),
  ].filter(Boolean);
  return (
    <>
      <div className="item-tip-head">
        <img src={IMG.item(i.id)} alt="" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        <span>
          <strong>{i.name}</strong>
          <span className="small muted">{[i.subCategory ?? i.category, i.untradeable ? 'untradable' : ''].filter(Boolean).join(' · ')}</span>
        </span>
      </div>
      {needs.length > 0 && <div className="small">Needs {needs.join(' · ')}</div>}
      {stats && <div className="small"><strong>{stats}</strong></div>}
      {i.description && <div className="small muted item-tip-desc">{cleanText(i.description)}</div>}
      <div className="small item-tip-prices">
        {shop && <span>Shop {fmt(shop.price)}{shop.notOpen ? ' (not open yet)' : ''}</span>}
        {cash && <span>{fmt(cash.nx)} NX · {cash.duration}</span>}
        {crates.slice(0, 2).map((c) => <span key={c.crate.key}>{c.rate}% in {c.crate.label}</span>)}
        {i.sellPrice ? <span className="muted">NPC buys for {fmt(i.sellPrice)}</span> : null}
      </div>
    </>
  );
}
