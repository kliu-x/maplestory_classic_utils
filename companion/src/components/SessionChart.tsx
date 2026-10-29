import { useState } from 'react';
import type { SavedSession } from '../models/types';
import { mapById } from '../data';
import { fmt } from './ui';

// EXP/min per run, oldest to newest. Party runs are grey and striped (shared EXP, not a
// solo rate). Hover a bar to preview it, click to open its card; only the best and latest
// are labelled.

const MAX_BARS = 20;
const when = (at: string) => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function SessionChart({ sessions, best, selected, onSelect }: { sessions: SavedSession[]; best: string | null; selected: string | null; onSelect: (id: string) => void }) {
  const runs = [...sessions].sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_BARS);
  const [picked, setPicked] = useState<string | null>(null);
  if (runs.length < 2) return null;
  const top = Math.max(...runs.map((s) => s.expPerActiveMin), 1);
  const latest = runs[runs.length - 1].id;
  const shown = runs.find((s) => s.id === picked) ?? runs.find((s) => s.id === selected) ?? runs.find((s) => s.id === latest)!;
  const hasParty = runs.some((s) => s.party);

  return (
    <div className="sess-chart">
      <div className="sess-chart-tip" aria-live="polite">
        <strong>{fmt(shown.expPerActiveMin)}</strong> EXP/min
        <span className="muted"> · {shown.mapId != null ? mapById.get(shown.mapId)?.name ?? 'Unknown map' : 'No map'} · {when(shown.at)}{shown.party ? ' · Party' : ''}</span>
      </div>
      <div className="sess-bars" role="list" onMouseLeave={() => setPicked(null)}>
        {runs.map((s) => {
          const label = s.id === best || s.id === latest;
          return (
            <button
              key={s.id}
              role="listitem"
              className={`sess-bar ${s.party ? 'party' : ''} ${s.id === shown.id ? 'on' : ''}`}
              aria-pressed={s.id === selected}
              onMouseEnter={() => setPicked(s.id)}
              onFocus={() => setPicked(s.id)}
              onClick={() => onSelect(s.id)}
              aria-label={`${when(s.at)}: ${fmt(s.expPerActiveMin)} EXP per minute${s.party ? ', party' : ''}`}
            >
              {label && <span className="sess-val">{s.id === best ? '🏆 ' : ''}{fmt(s.expPerActiveMin)}</span>}
              <span className="sess-fill" style={{ height: `${Math.max(2, (s.expPerActiveMin / top) * 100)}%` }} />
            </button>
          );
        })}
      </div>
      <div className="sess-axis small muted">
        <span>Older · click a bar to open it</span>
        {hasParty && <span><i className="sess-key" /> Solo <i className="sess-key party" /> Party</span>}
        <span>Newest</span>
      </div>
    </div>
  );
}
