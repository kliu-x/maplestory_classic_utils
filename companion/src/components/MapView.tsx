import { useState } from 'react';
import type { GameMap } from '../models/types';
import { IMG } from '../data';
import { minimapPoint, pathfinderUrl } from '../calculators/route';
import { href } from '../router';

export interface Pin {
  x: number;
  y: number;
  label: string;
  /** 'spot': where to go (drawn as a big circle, like a marked-up screenshot). */
  kind: 'npc' | 'portal' | 'mob' | 'spot';
  /** The one the user is looking for: drawn bigger, label always on top. */
  highlight?: boolean;
}

/**
 * The map's in-game minimap with pins at world positions (NPCs, the portal you arrive by...).
 * "Whole map" swaps in the full-size drawing of the map, which shares the minimap's frame,
 * so the same pins land in the same places. With a spot, it opens on the whole map.
 */
export function MapView({ map, pins = [], caption }: { map: GameMap; pins?: Pin[]; caption?: string }) {
  const [failed, setFailed] = useState(false);
  const [full, setFull] = useState(() => pins.some((p) => p.kind === 'spot'));
  const [loading, setLoading] = useState(full);
  const frame = minimapPoint(map, 0, 0);
  const toggle = () => {
    setLoading(!full);
    setFull(!full);
  };
  return (
    <figure className="mapview">
      <figcaption>
        <a href={href('maps', { id: map.id })}><strong>{map.name}</strong></a> <span className="muted small">{map.street}</span>
        {frame && <button className="btn small ghost" style={{ marginLeft: 8 }} onClick={toggle}>{full ? 'Small map' : 'Whole map'}</button>}
        <a className="small" style={{ marginLeft: 8 }} href={pathfinderUrl(map.id)} target="_blank" rel="noreferrer">Find path ↗</a>
        {caption && <div className="small muted">{caption}</div>}
      </figcaption>
      {frame && !failed ? (
        // Small minimaps stay small: at most 3x, 560px wide, 260px tall. The whole map fills the width.
        <div
          className={`mapview-img${full ? ' full' : ''}`}
          style={{ aspectRatio: `${frame.width} / ${frame.height}`, width: full ? Math.min(900, (520 * frame.width) / frame.height) : Math.min(560, frame.width * 3, (260 * frame.width) / frame.height) }}
        >
          <img
            key={full ? 'full' : 'mini'}
            src={full ? IMG.render(map.id) : IMG.minimap(map.id)}
            alt={full ? `The whole of ${map.name}` : `Minimap of ${map.name}`}
            loading="lazy"
            onLoad={() => setLoading(false)}
            onError={() => (full ? (setFull(false), setLoading(false)) : setFailed(true))}
          />
          {loading && <span className="mapview-loading small">Loading the whole map…</span>}
          {pins.map((p, i) => {
            const pt = minimapPoint(map, p.x, p.y)!;
            return (
              <span
                key={i}
                className={`mapview-pin ${p.kind}${p.highlight ? ' hl' : ''}`}
                style={{ left: `${(pt.left / pt.width) * 100}%`, top: `${(pt.top / pt.height) * 100}%` }}
                title={p.label}
              >
                <span className="mapview-label">{p.label}</span>
              </span>
            );
          })}
        </div>
      ) : (
        <p className="small muted">No minimap for this map.</p>
      )}
    </figure>
  );
}
