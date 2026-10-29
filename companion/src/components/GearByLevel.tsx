import { useState } from 'react';
import type { Character } from '../models/types';
import { BRANCHES, CHECKPOINTS, COST_LABEL, GEAR_NOTES, GEAR_SOURCES, TIER_LABEL, checkpointOf, defaultBranch, gearFamily, picksAt, type GearPick } from '../data/gearGuide';
import { fmt, SourceBadge, StatusPill } from './ui';

/** Best / affordable / easy-to-get gear at each level checkpoint, from Classic World guides. */
export function GearByLevel({ c }: { c: Character }) {
  const family = gearFamily(c.job);
  const now = checkpointOf(c.level);
  const [cp, setCp] = useState(now);
  const branches = family ? BRANCHES[family] : [];
  const [branch, setBranch] = useState<string | null>(defaultBranch(c.job));
  if (!family) return null;
  const slots = picksAt(family, branch, cp);
  return (
    <div className="card">
      <div className="card-head">
        <h2>Gear by level</h2>
        <span className="small muted">From Classic World guides, mostly MeowDB · prices are estimates</span>
      </div>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="seg">
          {CHECKPOINTS.map((x) => (
            <button key={x} className={cp === x ? 'on' : ''} onClick={() => setCp(x)}>
              Lv {x}{x === now ? ' ·you' : ''}
            </button>
          ))}
        </div>
        {branches.length > 0 && (
          <div className="seg">
            <button className={branch == null ? 'on' : ''} onClick={() => setBranch(null)}>All weapons</button>
            {branches.map((b) => <button key={b.id} className={branch === b.id ? 'on' : ''} onClick={() => setBranch(b.id)}>{b.label}</button>)}
          </div>
        )}
      </div>
      {cp >= 30 && (
        <p className="callout warn small" style={{ marginTop: 0 }}>
          Lv 30 weapons aren't sold in any open shop at launch (only Orbis / El Nath, not open yet): craft them, buy on the Free Market, or keep your Lv 25 shop weapon.
        </p>
      )}
      {slots.length === 0 && <div className="empty">No guide picks at this level.</div>}
      <div className="gear-slots">
        {slots.map(({ slot, picks }) => (
          <div key={slot} className="gear-slot">
            <h3>{slot[0].toUpperCase() + slot.slice(1)}</h3>
            {picks.map((p, i) => <PickRow key={i} p={p} />)}
          </div>
        ))}
      </div>
      <details style={{ marginTop: 10 }}>
        <summary className="small"><strong>Good to know</strong> (scroll targets, shops, how the tiers were picked)</summary>
        <ul className="notes small" style={{ color: 'var(--text)' }}>
          {GEAR_NOTES.map((n) => (
            <li key={n.topic}>
              <strong>{n.topic}:</strong> {n.text} {n.sourceIds.map((id) => GEAR_SOURCES[id] && <SourceBadge key={id} source={GEAR_SOURCES[id]} compact />)}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function PickRow({ p }: { p: GearPick }) {
  return (
    <div className={`gear-pick ${p.tier}`}>
      <div className="gear-pick-head">
        <span className={`gear-tier ${p.tier}`}>{TIER_LABEL[p.tier]}</span>
        <strong>{p.item}</strong>
        {p.reqLevel != null && <span className="muted small">Lv {p.reqLevel}</span>}
        <span className="spacer" />
        <span className="gear-cost" title={p.costNote ?? undefined}>
          {p.estCost != null ? `${p.estCost === 0 ? 'free' : `~${fmt(p.estCost)}`}` : 'price ?'}
          {p.costKind && p.estCost !== 0 && <span className="muted small"> {COST_LABEL[p.costKind]}</span>}
        </span>
      </div>
      <div className="small">
        {[p.stats, p.howToGet && p.howToGet !== 'Not stated' ? p.howToGet : 'where to get it: not in the guides', !p.guidePick && 'from a shop list, not a guide pick'].filter(Boolean).join(' · ')}{' '}
        {p.sourceIds.map((id) => GEAR_SOURCES[id] && <SourceBadge key={id} source={p.conflict ? { ...GEAR_SOURCES[id], verification_status: 'conflicting' } : GEAR_SOURCES[id]} compact />)}
      </div>
      {p.conflict && <div className="small" style={{ marginTop: 2 }}><StatusPill status="conflicting" /> {p.conflict}</div>}
    </div>
  );
}
