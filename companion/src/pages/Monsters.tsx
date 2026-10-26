import { useEffect, useMemo, useState } from 'react';
import type { Element, Monster } from '../models/types';
import { MONSTERS, attackSkillsForJob, monsterById } from '../data';
import { evaluateMonsterFor, isPqVariant } from '../calculators/rank';
import { touchRecentMonster, upsertCharacter, useAppState } from '../storage/store';
import { go, href } from '../router';
import { ElemTags, fmt, fmt1, NumField, ProvenancePill, SourceBadge } from '../components/ui';
import { useActive, type PageProps } from './shared';

type SortKey = 'level' | 'hp' | 'exp' | 'expPerHp' | 'name';
const ELEMENTS: Element[] = ['fire', 'ice', 'lightning', 'poison', 'holy'];

export default function Monsters({ params }: PageProps) {
  const { character: c, assumptions } = useActive();
  const recent = useAppState().settings.recentMonsters;
  const [q, setQ] = useState('');
  const [minLv, setMinLv] = useState(1);
  const [maxLv, setMaxLv] = useState(100);
  const [weakTo, setWeakTo] = useState<Element | ''>('');
  const [spawnsOnly, setSpawnsOnly] = useState(true);
  const [bosses, setBosses] = useState(true);
  const [favOnly, setFavOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('level');
  const selected = params.get('id') ? monsterById.get(Number(params.get('id'))) : undefined;

  useEffect(() => {
    if (selected) touchRecentMonster(selected.id);
  }, [selected]);

  const favs = new Set(c?.favorites ?? []);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const r = MONSTERS.filter(
      (m) =>
        (!t || m.name.toLowerCase().includes(t)) &&
        m.level >= minLv &&
        m.level <= maxLv &&
        (!weakTo || m.elements[weakTo] === 'weak') &&
        (!spawnsOnly || m.spawns.length > 0 || (bosses && m.isBoss)) &&
        (bosses || !m.isBoss) &&
        (!favOnly || favs.has(m.id)),
    );
    const key: Record<SortKey, (m: Monster) => number | string> = {
      level: (m) => m.level, hp: (m) => m.hp, exp: (m) => -m.exp, expPerHp: (m) => -(m.exp / m.hp), name: (m) => m.name,
    };
    return r.sort((a, b) => (key[sort](a) < key[sort](b) ? -1 : key[sort](a) > key[sort](b) ? 1 : a.level - b.level));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, minLv, maxLv, weakTo, spawnsOnly, bosses, favOnly, sort, c?.favorites]);

  const toggleFav = (id: number) => {
    if (!c) return;
    upsertCharacter({ ...c, favorites: favs.has(id) ? c.favorites.filter((x) => x !== id) : [...c.favorites, id] });
  };

  const th = (k: SortKey, label: string, num = true) => (
    <th className={`sortable ${num ? 'num' : ''}`} onClick={() => setSort(k)}>
      {label}
      {sort === k ? ' ▾' : ''}
    </th>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Monsters</h1>
          <p>{MONSTERS.length} Classic World monsters from the game files. Spawn points are counted from every map file.</p>
        </div>
      </div>

      {selected && <MonsterDetail m={selected} fav={favs.has(selected.id)} onFav={() => toggleFav(selected.id)} />}

      {recent.length > 0 && (
        <div className="row small" style={{ margin: '12px 0' }}>
          <span className="muted">Recently viewed:</span>
          {recent.map((id) => monsterById.get(id)).filter(Boolean).map((m) => (
            <a key={m!.id} href={href('monsters', { id: m!.id })} className="pill neutral">{m!.name}</a>
          ))}
        </div>
      )}

      <div className="card" style={{ marginTop: selected ? 16 : 0 }}>
        <div className="row" style={{ alignItems: 'end' }}>
          <label className="field" style={{ flex: '1 1 180px' }}>
            Name
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name" />
          </label>
          <NumField label="Min level" value={minLv} min={1} max={100} width={70} onChange={setMinLv} />
          <NumField label="Max level" value={maxLv} min={1} max={100} width={70} onChange={setMaxLv} />
          <label className="field">
            Weak to
            <select value={weakTo} onChange={(e) => setWeakTo(e.target.value as Element | '')}>
              <option value="">any</option>
              {ELEMENTS.map((e) => <option key={e}>{e}</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={spawnsOnly} onChange={(e) => setSpawnsOnly(e.target.checked)} /> Has spawns</label>
          <label className="check"><input type="checkbox" checked={bosses} onChange={(e) => setBosses(e.target.checked)} /> Bosses</label>
          <label className="check" title={c ? '' : 'Create a character to save favorites'}>
            <input type="checkbox" checked={favOnly} disabled={!c} onChange={(e) => setFavOnly(e.target.checked)} /> Favorites
          </label>
        </div>
      </div>

      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th></th>
              {th('name', 'Monster', false)}
              {th('level', 'Lv')}
              {th('hp', 'HP')}
              {th('exp', 'EXP')}
              {th('expPerHp', 'EXP/HP')}
              <th className="num">W.DEF</th>
              <th className="num">M.DEF</th>
              <th className="num">EVA</th>
              <th>Elements</th>
              <th>Best spawn map</th>
            </tr>
          </thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id} className={`clickable ${selected?.id === m.id ? 'selected' : ''}`} onClick={() => go('monsters', { id: m.id })}>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className={`star ${favs.has(m.id) ? 'on' : ''}`} disabled={!c} onClick={() => toggleFav(m.id)} aria-label="Favorite">★</button>
                </td>
                <td>
                  <strong>{m.name}</strong> {m.isBoss && <span className="pill accent">boss</span>}{isPqVariant(m.id) && <span className="pill neutral" title="Party-quest / event copy (id 800000+)">PQ/event</span>}
                </td>
                <td className="num">{m.level}</td>
                <td className="num">{fmt(m.hp)}</td>
                <td className="num">{fmt(m.exp)}</td>
                <td className="num">{(m.exp / m.hp).toFixed(3)}</td>
                <td className="num">{m.pdd}</td>
                <td className="num">{m.mdd}</td>
                <td className="num">{m.evasion}</td>
                <td><ElemTags m={m} /></td>
                <td className="small">{m.spawns[0] ? `${m.spawns[0].mapName} (${m.spawns[0].count})` : <span className="muted">none in map files</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {list.length === 0 && <div className="empty">No monsters match.</div>}
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        Element tags use the raw game code with the legacy meaning (1 immune, 2 resist, 3 weak); the multiplier Classic World applies is disputed.
      </p>
    </>
  );

  function MonsterDetail({ m, fav, onFav }: { m: Monster; fav: boolean; onFav: () => void }) {
    const rows = c ? attackSkillsForJob(c.job).map((s) => ({ s, r: evaluateMonsterFor(c, s.skill.id, m, assumptions) })) : [];
    return (
      <div className="card">
        <div className="card-head">
          <h2>
            <button className={`star ${fav ? 'on' : ''}`} onClick={onFav} disabled={!c} aria-label="Favorite">★</button> {m.name}{' '}
            <span className="muted">Lv {m.level}</span>
          </h2>
          <div className="row">
            <SourceBadge source={m.source} compact />
            <a className="btn small" href={href('monsters')}>Close</a>
          </div>
        </div>
        <div className="detail-grid">
          {[
            ['HP', fmt(m.hp)], ['MP', fmt(m.mp)], ['EXP', fmt(m.exp)], ['W.DEF', m.pdd], ['M.DEF', m.mdd], ['Accuracy', m.accuracy], ['Evasion', m.evasion], ['Element code', m.elemRaw || '—'],
          ].map(([k, v]) => (
            <div className="kv" key={String(k)}><div className="k">{k}</div><div className="v">{v}</div></div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}><ElemTags m={m} /></div>
        {m.source.notes && <p className="small muted" style={{ marginTop: 6 }}>{m.source.notes}</p>}

        <div className="grid grid-2" style={{ marginTop: 12 }}>
          <div>
            <h3>Spawns ({m.spawns.reduce((t, s) => t + s.count, 0)} points on {m.spawns.length} maps)</h3>
            <ul className="notes" style={{ fontSize: 13, color: 'var(--text)' }}>
              {m.spawns.slice(0, 12).map((s) => (
                <li key={s.mapId}>
                  <a href={href('maps', { id: s.mapId })}>{s.mapName}</a> <span className="muted">· {s.count} spawn points</span>
                </li>
              ))}
            </ul>
          </div>
          {c && (
            <div>
              <h3>{c.name} vs {m.name}</h3>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Attack</th><th className="num">Casts to kill</th><th className="num">EXP/cast</th><th>Damage</th></tr></thead>
                  <tbody>
                    {rows.map(({ s, r }) => (
                      <tr key={s.skill.id}>
                        <td>{s.skill.name} <span className="muted small">Lv {c.skills[s.skill.id] ?? 0}</span></td>
                        <td className="num">{fmt(r.eval.kill.best)}–{fmt(r.eval.kill.p90)} <span className="muted">(avg {fmt1(r.eval.kill.expected)})</span></td>
                        <td className="num">{fmt1(r.eval.expPerCast)}</td>
                        <td><ProvenancePill p={r.atk.provenance} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <a className="small" href={href('characters', { id: c.id })}>Record damage on {m.name} →</a>
            </div>
          )}
        </div>
      </div>
    );
  }
}
