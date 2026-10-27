import { useState } from 'react';
import type { GameMap } from '../models/types';
import { IMG } from '../data';
import { minimapPoint } from '../calculators/route';
import { href } from '../router';

export interface Pin {
  x: number;
  y: number;
  label: string;
  kind: 'npc' | 'portal' | 'mob';
  /** The one the user is looking for: drawn bigger, label always on top. */
  highlight?: boolean;
}

/** The map's in-game minimap with pins at world positions (NPCs, the portal you arrive by...). */
export function MapView({ map, pins = [], caption }: { map: GameMap; pins?: Pin[]; caption?: string }) {
  const [failed, setFailed] = useState(false);
  const frame = minimapPoint(map, 0, 0);
  return (
    <figure className="mapview">
      <figcaption>
        <a href={href('maps', { id: map.id })}><strong>{map.name}</strong></a> <span className="muted small">{map.street}</span>
        {caption && <div className="small muted">{caption}</div>}
      </figcaption>
      {frame && !failed ? (
        // Small minimaps stay small: at most 3x, 560px wide, 260px tall.
        <div className="mapview-img" style={{ aspectRatio: `${frame.width} / ${frame.height}`, width: Math.min(560, frame.width * 3, (260 * frame.width) / frame.height) }}>
          <img src={IMG.minimap(map.id)} alt={`Minimap of ${map.name}`} loading="lazy" onError={() => setFailed(true)} />
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
