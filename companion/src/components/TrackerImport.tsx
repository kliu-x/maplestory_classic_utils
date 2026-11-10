import { useState, type DragEvent } from 'react';
import { MAPS } from '../data';
import { parseTrackerFile, mergeSessions } from '../integrations/expTrackerImport';
import { addChatOffers } from '../storage/chatOffers';
import { getState, upsertCharacter } from '../storage/store';
import { fmt } from './ui';

/**
 * Import from the Maple EXP Tracker (a separate Windows overlay): its data folder's session_log.json and
 * market_log.json, or its CSV exports. Sessions go to the active character, chat offers to the Chat Market.
 * Files are read in this browser; nothing is uploaded.
 */
export function TrackerImport({ compact }: { compact?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const read = async (files: FileList | null) => {
    if (!files?.length) return;
    const lines: string[] = [];
    for (const f of Array.from(files)) {
      const r = parseTrackerFile(await f.text(), MAPS);
      if (r.kind === 'sessions') {
        const s = getState();
        const c = s.characters.find((x) => x.id === s.settings.activeCharacterId);
        if (!c) {
          lines.push(`${f.name}: create a character first, then import sessions into it.`);
          continue;
        }
        const m = mergeSessions(c.sessions ?? [], r.sessions);
        if (m.added) upsertCharacter({ ...c, sessions: m.sessions });
        const noMap = r.sessions.filter((x) => x.mapId == null).length;
        lines.push(`${f.name}: ${fmt(m.added)} new session${m.added === 1 ? '' : 's'} for ${c.name}${r.sessions.length - m.added ? ` (${r.sessions.length - m.added} already here)` : ''}${noMap ? `; ${noMap} without a map we recognise, pick it on the session` : ''}.`);
      } else if (r.kind === 'offers') {
        const added = addChatOffers(r.offers);
        lines.push(`${f.name}: ${fmt(r.offers.length)} chat offers, ${fmt(added)} new.`);
      } else {
        lines.push(`${f.name}: not a Maple EXP Tracker log (expected session_log.json, market_log.json or their CSV exports).`);
      }
      if (r.skipped) lines[lines.length - 1] += ` ${r.skipped} unreadable line${r.skipped === 1 ? '' : 's'} skipped.`;
    }
    setMsg(lines.join('\n'));
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void read(e.dataTransfer.files);
  };

  return (
    <div
      className={`tracker-import ${over ? 'over' : ''} ${compact ? 'compact' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <div className="row" style={{ gap: 10 }}>
        <label className="btn">
          Import from Maple EXP Tracker
          <input type="file" accept=".json,.csv,application/json,text/csv" multiple hidden onChange={(e) => { void read(e.target.files); e.target.value = ''; }} />
        </label>
        <span className="small muted">
          Pick or drop <code>session_log.json</code> and <code>market_log.json</code> from the tracker's <code>data</code> folder (or its CSV exports). Read here, never uploaded.
        </span>
      </div>
      {msg && <pre className="small tracker-import-msg">{msg}</pre>}
    </div>
  );
}
