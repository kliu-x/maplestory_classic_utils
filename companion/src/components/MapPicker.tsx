import { useMemo, useState, type ReactNode } from 'react';
import { MAPS, mapById, monsterById } from '../data';
import type { GameMap } from '../models/types';

// Pick a hunting map without scrolling a list of hundreds: likely maps as one-click chips,
// and a search that also matches monster names ("bubbling" finds the subway).

const HUNT_MAPS = MAPS.filter((m) => !m.isTown && m.spawns.length > 0);
const monstersOn = (m: GameMap) => [...new Set(m.spawns.map((s) => monsterById.get(s.mobId)?.name).filter(Boolean))] as string[];
const haystack = new Map(HUNT_MAPS.map((m) => [m.id, `${m.name} ${m.street} ${monstersOn(m).join(' ')}`.toLowerCase()]));

function search(q: string): GameMap[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const hits = HUNT_MAPS.filter((m) => words.every((w) => haystack.get(m.id)!.includes(w)));
  // Map-name matches first, then the maps with the most spawns of the monster searched for.
  const score = (m: GameMap) =>
    (m.name.toLowerCase().includes(words[0]) ? 1e6 : 0) +
    m.spawns.reduce((n, s) => n + (words.some((w) => monsterById.get(s.mobId)?.name.toLowerCase().includes(w)) ? s.count : 0), 0);
  return hits.sort((a, b) => score(b) - score(a)).slice(0, 8);
}

function MapLine({ m }: { m: GameMap }) {
  const mobs = monstersOn(m);
  return (
    <>
      <strong>{m.name}</strong>{' '}
      <span className="small muted">
        {m.street}
        {mobs.length ? ` · ${mobs.slice(0, 3).join(', ')}${mobs.length > 3 ? '…' : ''}` : ''}
      </span>
    </>
  );
}

export function MapPicker({ value, onChange, suggest, note }: { value: number | null; onChange: (id: number | null) => void; suggest: (number | null | undefined)[]; note?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = value != null ? mapById.get(value) : undefined;
  const chips = useMemo(
    () => [...new Set(suggest.filter((id): id is number => id != null && id !== value && haystack.has(id)))].slice(0, 5).map((id) => mapById.get(id)!),
    [suggest, value],
  );
  const results = useMemo(() => search(q), [q]);
  const pick = (id: number) => {
    onChange(id);
    setOpen(false);
    setQ('');
  };

  if (current && !open) {
    return (
      <div className="map-picker">
        <MapLine m={current} />{' '}
        <button className="link-btn small" onClick={() => setOpen(true)}>Change</button>
        {note && <div className="small muted">{note}</div>}
      </div>
    );
  }
  return (
    <div className="map-picker open">
      {!current && <div className="small"><strong>Which map?</strong>{note && <span className="muted"> {note}</span>}</div>}
      {chips.length > 0 && (
        <div className="row" style={{ gap: 6, margin: '6px 0' }}>
          {chips.map((m) => (
            <button key={m.id} className="btn small" onClick={() => pick(m.id)} title={`${m.street} · ${monstersOn(m).join(', ')}`}>
              {m.name}
            </button>
          ))}
        </div>
      )}
      <input type="search" placeholder="Search a map or monster, e.g. bubbling" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={open} style={{ width: '100%', maxWidth: 420 }} />
      {results.length > 0 && (
        <ul className="map-results">
          {results.map((m) => (
            <li key={m.id}>
              <button onClick={() => pick(m.id)}><MapLine m={m} /></button>
            </li>
          ))}
        </ul>
      )}
      {q && !results.length && <div className="small muted">No hunting map matches “{q}”.</div>}
      {current && <button className="link-btn small" onClick={() => { setOpen(false); setQ(''); }}>Keep {current.name}</button>}
    </div>
  );
}
