import { useMemo, useState } from 'react';
import { IMG, MAPS, QUESTS, mapById, monsterById } from '../data';
import { go, href } from '../router';
import { MapView } from '../components/MapView';
import { SourceBadge } from '../components/ui';
import type { PageProps } from './shared';

const REGIONS = [...new Set(MAPS.map((m) => m.region).filter(Boolean))].sort();

export default function Maps({ params }: PageProps) {
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('');
  const [huntOnly, setHuntOnly] = useState(false);
  const selected = params.get('id') ? mapById.get(Number(params.get('id'))) : undefined;
  const npcId = Number(params.get('npc')) || null;
  const npc = npcId != null ? selected?.npcs.find((n) => n.id === npcId) : undefined;
  const npcQuests = npcId != null ? QUESTS.filter((q) => q.npcId === npcId || q.endNpcId === npcId) : [];
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return MAPS.filter((m) => (!t || `${m.name} ${m.street}`.toLowerCase().includes(t)) && (!region || m.region === region) && (!huntOnly || m.spawns.length > 0));
  }, [q, region, huntOnly]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Maps</h1>
          <p>{MAPS.length} Classic World maps: monster spawn points, exits and NPCs from the map files.</p>
        </div>
      </div>

      {selected && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <h2>
              {selected.name} <span className="muted small">{selected.street}{selected.region ? ` · ${selected.region}` : ''}</span>
            </h2>
            <div className="row">
              <SourceBadge source={selected.source} compact />
              <a className="btn small" href={href('training', { map: selected.id })}>Training estimate</a>
              <a className="btn small" href={href('maps')}>Close</a>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            {npc && (
              <div className="callout info" style={{ marginBottom: 8 }}>
                <div className="icon-row">
                  <img src={IMG.npc(npc.id)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                  <span><strong>{npc.name}</strong> is the big pin below{selected.returnMap ? <> · nearest town: <a href={href('maps', { id: selected.returnMap })}>{mapById.get(selected.returnMap)?.name}</a></> : null}</span>
                </div>
                {npcQuests.length > 0 && (
                  <div className="small" style={{ marginTop: 4 }}>
                    Quests: {npcQuests.map((q, i) => <span key={q.id}>{i > 0 && ' · '}<a href={href('quests', { id: q.id })}>{q.name}</a> <span className="muted">Lv {q.minLevel}</span></span>)}
                  </div>
                )}
              </div>
            )}
            <MapView map={selected} pins={selected.npcs.map((n) => ({ x: n.x, y: n.y, label: n.name, kind: 'npc' as const, highlight: n.id === npcId }))} />
          </div>
          <div className="grid grid-3">
            <div>
              <h3>Monsters</h3>
              {selected.spawns.length === 0 && <p className="muted small">None.</p>}
              <ul className="notes" style={{ color: 'var(--text)', fontSize: 13 }}>
                {selected.spawns.map((s) => {
                  const m = monsterById.get(s.mobId);
                  return (
                    <li key={s.mobId}>
                      <a href={href('monsters', { id: s.mobId })}>{m?.name ?? `mob ${s.mobId}`}</a> <span className="muted">Lv {m?.level} · {s.count} spawn points</span>
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <h3>Exits (portals)</h3>
              {selected.portalsTo.length === 0 && <p className="muted small">No portal targets in the map file.</p>}
              <ul className="notes" style={{ fontSize: 13 }}>
                {selected.portalsTo.map((id) => (
                  <li key={id}>{mapById.get(id) ? <a href={href('maps', { id })}>{mapById.get(id)!.name}</a> : <span className="muted">map {id} (not in dataset)</span>}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Details</h3>
              <ul className="notes" style={{ fontSize: 13 }}>
                <li>Size {selected.width}×{selected.height}px</li>
                <li>{selected.isTown ? 'Town' : 'Field'} · mobRate {selected.mobRate}</li>
                {selected.npcs.length > 0 && <li>NPCs: {selected.npcs.map((n) => n.name).join(', ')}</li>}
              </ul>
              <p className="small muted">Map connections come from portal data; hidden portals and routes needing a ship or taxi may be missing.</p>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row" style={{ alignItems: 'end' }}>
          <label className="field" style={{ flex: '1 1 200px' }}>
            Search
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Map or street name" />
          </label>
          <label className="field">
            Region
            <select value={region} onChange={(e) => setRegion(e.target.value)}>
              <option value="">all</option>
              {REGIONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={huntOnly} onChange={(e) => setHuntOnly(e.target.checked)} /> Hunting maps only</label>
        </div>
      </div>
      <div className="table-wrap" style={{ marginTop: 12 }}>
        <table>
          <thead><tr><th>Map</th><th>Street</th><th>Region</th><th>Monsters</th><th className="num">Spawn pts</th><th className="num">Exits</th></tr></thead>
          <tbody>
            {list.map((m) => (
              <tr key={m.id} className={`clickable ${selected?.id === m.id ? 'selected' : ''}`} onClick={() => go('maps', { id: m.id })}>
                <td><strong>{m.name}</strong>{m.isTown && <span className="pill neutral"> town</span>}</td>
                <td className="small">{m.street}</td>
                <td className="small">{m.region}</td>
                <td className="small">{m.spawns.map((s) => monsterById.get(s.mobId)?.name).filter(Boolean).join(', ')}</td>
                <td className="num">{m.spawns.reduce((t, s) => t + s.count, 0) || ''}</td>
                <td className="num">{m.portalsTo.length || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
