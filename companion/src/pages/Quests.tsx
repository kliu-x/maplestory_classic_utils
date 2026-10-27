import { useMemo, useState } from 'react';
import { QUESTS, npcById, questSearchText } from '../data';
import { QuestDetail } from '../components/QuestDetail';
import { href } from '../router';
import { SOURCES } from '../data/sources';
import { upsertCharacter } from '../storage/store';
import { fmt, NumField, SourceBadge, StatusPill } from '../components/ui';
import { useActive, type PageProps } from './shared';

const AREAS = [...new Set(QUESTS.map((q) => q.area).filter(Boolean))].sort();
const questName = new Map(QUESTS.map((q) => [q.id, q.name]));

export default function Quests({ params }: PageProps) {
  const { character: c } = useActive();
  const focus = Number(params.get('id')) || null;
  const [q, setQ] = useState('');
  const [area, setArea] = useState('');
  const [maxLv, setMaxLv] = useState<number>(c?.level ?? 100);
  const [minExp, setMinExp] = useState(0);
  const [hideDone, setHideDone] = useState(true);
  const [repeatOnly, setRepeatOnly] = useState(false);
  const [sort, setSort] = useState<'level' | 'exp'>('level');
  const done = new Set(c?.completedQuests ?? []);

  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const r = QUESTS.filter(
      (x) => (!t || questSearchText(x).includes(t)) && (!area || x.area === area) && x.minLevel <= maxLv && x.exp >= minExp && (!hideDone || !done.has(x.id)) && (!repeatOnly || x.repeatable),
    );
    return r.sort((a, b) => (sort === 'exp' ? b.exp - a.exp : a.minLevel - b.minLevel || b.exp - a.exp));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, area, maxLv, minExp, hideDone, repeatOnly, sort, c?.completedQuests]);

  const toggle = (id: number) => {
    if (!c) return;
    upsertCharacter({ ...c, completedQuests: done.has(id) ? c.completedQuests.filter((x) => x !== id) : [...c.completedQuests, id] });
  };
  const focused = focus ? QUESTS.find((x) => x.id === focus) : undefined;
  const shown = focused ? [focused] : list;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Quests</h1>
          <p>{QUESTS.length} quests from the Classic World files. Completion is tracked per character{c ? ` (${c.name}: ${done.size} done)` : ''}.</p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Kerning City Party Quest (KPQ)</h2>
        </div>
        <div className="grid grid-2">
          <ul className="notes" style={{ color: 'var(--text)', fontSize: 13 }}>
            <li>Level 21+, talk to <strong>Lakelis</strong>, <strong>channels 3–12 only</strong> <SourceBadge source={SOURCES.launchNotes} compact /></li>
            <li>Exactly 4 party members, no level cap, 30-minute limit <SourceBadge source={SOURCES.meowKpq} compact /></li>
            <li>King Slime (final stage) gives 2,400 EXP per the game files <StatusPill status="verified" /></li>
            <li>Proof of Companionship reward and per-stage EXP (e.g. Ligator 68 EXP in stage 1) <SourceBadge source={SOURCES.meowKpq} compact /></li>
          </ul>
          <div className="callout warn small">
            Rush / bonus rules: no source found for Classic World yet. Pre-Big-Bang KPQ rules (e.g. EXP per stage, coupon counts) should not be assumed. Record what you see in game and treat other guides as
            leads.
          </div>
        </div>
      </div>

      <div className="card">
        {focus ? (
          <>
            <div className="row"><span>Showing one quest.</span><a className="btn small" href="#/quests">Show all</a></div>
            {focused && <QuestDetail quest={focused} />}
          </>
        ) : (
          <div className="row" style={{ alignItems: 'end' }}>
            <label className="field" style={{ flex: '1 1 180px' }}>
              Search
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Quest, NPC, monster or item" />
            </label>
            <label className="field">
              Area
              <select value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="">all</option>
                {AREAS.map((a) => <option key={a}>{a}</option>)}
              </select>
            </label>
            <NumField label="Available at level ≤" value={maxLv} min={1} max={100} width={70} onChange={setMaxLv} />
            <NumField label="Min EXP" value={minExp} min={0} width={90} onChange={setMinExp} />
            <label className="check"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide completed</label>
            <label className="check"><input type="checkbox" checked={repeatOnly} onChange={(e) => setRepeatOnly(e.target.checked)} /> Repeatable only</label>
            <div className="seg">
              <button className={sort === 'level' ? 'on' : ''} onClick={() => setSort('level')}>By level</button>
              <button className={sort === 'exp' ? 'on' : ''} onClick={() => setSort('exp')}>By EXP</button>
            </div>
          </div>
        )}
      </div>

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr><th>Done</th><th>Quest</th><th>Area</th><th className="num">Min Lv</th><th className="num">EXP</th><th className="num">Mesos</th><th className="num">Items</th><th>Requires quest</th><th>NPC</th><th></th></tr>
          </thead>
          <tbody>
            {shown.slice(0, 300).map((x) => (
              <tr key={x.id} className={x.id === focus ? 'selected' : ''}>
                <td><input type="checkbox" disabled={!c} checked={done.has(x.id)} onChange={() => toggle(x.id)} aria-label={`Completed ${x.name}`} /></td>
                <td><a href={href('quests', { id: x.id })}><strong>{x.name}</strong></a>{x.repeatable && <span className="pill accent"> repeatable</span>}</td>
                <td className="small">{x.area}</td>
                <td className="num">{x.minLevel || '—'}{x.maxLevel ? `–${x.maxLevel}` : ''}</td>
                <td className="num">{fmt(x.exp)}</td>
                <td className="num">{fmt(x.meso)}</td>
                <td className="num">{x.rewardItemCount || ''}</td>
                <td className="small">{x.prereqQuestIds.map((id) => questName.get(id) ?? id).join(', ')}</td>
                <td className="small">{x.npcId != null ? npcById.get(x.npcId)?.name ?? x.npcId : ''}</td>
                <td><a href={x.source.source_url} target="_blank" rel="noreferrer"><StatusPill status={x.source.verification_status} /></a></td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <div className="empty">No quests match.</div>}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        Click a quest for its NPCs on the minimap, the route from the nearest town, and what to hunt or collect. Some quests are event or job-specific; check in game.
      </p>
    </>
  );
}
