import type { GameMap, Quest } from '../models/types';
import { IMG, MAPS, QUESTS, itemById, mapById, monsterById, npcById } from '../data';
import { QUEST_NOTES } from '../data/questNotes';
import { QUEST_LOG_TITLES } from '../data/questAliases';
import { homeTown, routeFromTown } from '../calculators/route';
import { href } from '../router';
import { fmt, SourceBadge, StatusPill } from './ui';
import { MapView, type Pin } from './MapView';

const questById = new Map(QUESTS.map((q) => [q.id, q]));
const nextOf = (id: number) => QUESTS.filter((q) => q.prereqQuestIds.includes(id));

/** Breadcrumb from the nearest town, e.g. Henesys → Henesys Hunting Ground I → ... */
function Route({ path }: { path: number[] }) {
  return (
    <div className="route">
      {path.map((id, i) => (
        <span key={id}>
          {i > 0 && <span className="arrow">→ </span>}
          <a href={href('maps', { id })}>{mapById.get(id)?.name ?? id}</a>
        </span>
      ))}
    </div>
  );
}

/** A map with how to get there: route from the nearest town and the portal you arrive by. */
function Place({ map, pins, caption }: { map: GameMap; pins: Pin[]; caption?: string }) {
  const path = routeFromTown(MAPS, map.id);
  const from = path && path.length > 1 ? path[path.length - 2] : null;
  const arrive = from != null ? map.portals.find((p) => p.toMap === from) : undefined;
  const all = arrive ? [...pins, { x: arrive.x, y: arrive.y, label: `from ${mapById.get(from!)?.name}`, kind: 'portal' as const }] : pins;
  return (
    <div className="stack" style={{ gap: 6 }}>
      <MapView map={map} pins={all} caption={caption} />
      {path ? (
        path.length > 1 ? (
          <div className="small"><span className="muted">From the nearest town:</span> <Route path={path} /></div>
        ) : (
          <div className="small muted">This is a town.</div>
        )
      ) : (
        <div className="small">
          {(() => {
            const home = homeTown(MAPS, map.id);
            return home != null ? <>Nearest town: <a href={href('maps', { id: home })}>{mapById.get(home)?.name}</a> (where you respawn from here). </> : null;
          })()}
          <span className="muted">The map files don't list every portal here, so the exact way in isn't shown.</span>
        </div>
      )}
    </div>
  );
}

function NpcPlace({ npcId, role }: { npcId: number; role: string }) {
  const npc = npcById.get(npcId);
  const maps = (npc?.mapIds ?? []).map((id) => mapById.get(id)).filter((m): m is GameMap => !!m);
  return (
    <div>
      <h3>{role}</h3>
      <div className="icon-row" style={{ marginBottom: 6 }}>
        <img src={IMG.npc(npcId)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
        <strong>{npc?.name ?? `NPC ${npcId}`}</strong>
      </div>
      {maps.length === 0 && <p className="small muted">Not placed on any map in the game files (may appear only during an event or via a quest).</p>}
      {maps.slice(0, 2).map((m) => {
        const spot = m.npcs.find((n) => n.id === npcId)!;
        return <Place key={m.id} map={m} pins={[{ x: spot.x, y: spot.y, label: npc?.name ?? 'NPC', kind: 'npc' }]} />;
      })}
      {maps.length > 2 && <p className="small muted">Also in {maps.length - 2} more map(s).</p>}
    </div>
  );
}

export function QuestDetail({ quest: q }: { quest: Quest }) {
  const note = QUEST_NOTES[q.id];
  const noteMap = note?.mapId ? mapById.get(note.mapId) : undefined;
  const prev = q.prereqQuestIds.map((id) => questById.get(id)).filter((x): x is Quest => !!x);
  const next = nextOf(q.id);
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="card-head">
        <h2>{q.name}</h2>
        <SourceBadge source={q.source} compact />
      </div>
      {QUEST_LOG_TITLES[q.id] && <p className="small muted" style={{ margin: '-6px 0 6px' }}>In your quest log under <strong>{QUEST_LOG_TITLES[q.id]}</strong></p>}
      <p className="small" style={{ marginTop: 0 }}>
        Lv {q.minLevel || 1}+{q.exp ? ` · ${fmt(q.exp)} EXP` : ''}{q.meso ? ` · ${fmt(q.meso)} mesos` : ''}
        {q.availableUntil && <> · event, start before <strong>{q.availableUntil}</strong></>}
      </p>
      {q.hint && <p className="callout info" style={{ marginTop: 0 }}>Objective from the game: <em>“{q.hint}”</em></p>}

      {note && (
        <div className="callout" style={{ marginBottom: 12 }}>
          <strong>Where to go</strong> {note.sources.map((s) => <SourceBadge key={s.source_url} source={s} compact />)}
          <p style={{ margin: '6px 0' }}>{note.where}</p>
          {note.alternatives?.map((a) => <p key={a} className="small" style={{ margin: '4px 0' }}><StatusPill status="conflicting" /> {a}</p>)}
          {noteMap && <Place map={noteMap} pins={[]} caption="Community location; the exact spot is described above (not in the game files)." />}
        </div>
      )}

      <div className="quest-detail">
        {q.npcId != null && <NpcPlace npcId={q.npcId} role={q.endNpcId ? 'Start: talk to' : 'Talk to (start and hand in)'} />}
        {q.endNpcId != null && <NpcPlace npcId={q.endNpcId} role="Hand in to" />}

        {(q.killMobs.length > 0 || q.collectItems.length > 0) && (
          <div>
            {q.killMobs.length > 0 && <h3>Hunt</h3>}
            {q.killMobs.map((k) => {
              const m = monsterById.get(k.mobId);
              return (
                <div key={k.mobId} style={{ marginBottom: 8 }}>
                  <div className="icon-row">
                    <img src={IMG.mob(k.mobId)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                    <span><a href={href('monsters', { id: k.mobId })}>{m?.name ?? `Monster ${k.mobId}`}</a> × {k.count}</span>
                  </div>
                  {m && m.spawns.length > 0 && (
                    <div className="small muted">
                      Found in: {m.spawns.slice(0, 3).map((s, i) => <span key={s.mapId}>{i > 0 && ', '}<a href={href('maps', { id: s.mapId })}>{s.mapName.split(': ').pop()}</a> ({s.count})</span>)}
                    </div>
                  )}
                </div>
              );
            })}
            {q.collectItems.length > 0 && <h3>Collect</h3>}
            {q.collectItems.map((it) => (
              <div key={it.itemId} className="icon-row" style={{ marginBottom: 6 }}>
                <img src={IMG.item(it.itemId)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                <span>{itemById.get(it.itemId)?.name ?? `Item ${it.itemId}`} × {it.count}</span>
              </div>
            ))}
            {q.collectItems.length > 0 && <p className="small muted">Which monsters drop each item is not in the dataset yet.</p>}
          </div>
        )}
      </div>

      {(prev.length > 0 || next.length > 0) && (
        <p className="small" style={{ marginBottom: 0 }}>
          {prev.length > 0 && <>Before: {prev.map((p) => <a key={p.id} href={href('quests', { id: p.id })} style={{ marginRight: 8 }}>{p.name}</a>)} </>}
          {next.length > 0 && <>Next: {next.map((n) => <a key={n.id} href={href('quests', { id: n.id })} style={{ marginRight: 8 }}>{n.name}</a>)}</>}
        </p>
      )}
      <p className="small muted" style={{ marginBottom: 0 }}>
        NPC positions, minimaps and portals come from the Classic World map files (images via maplestory.io). Routes follow portals only, so they may miss ships, taxis and hidden portals.
      </p>
    </div>
  );
}
