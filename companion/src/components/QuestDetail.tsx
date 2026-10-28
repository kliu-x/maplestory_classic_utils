import type { GameMap, Monster, Quest } from '../models/types';
import { IMG, MAPS, MONSTERS, QUESTS, itemById, mapById, monsterById, npcById } from '../data';
import { likelyDroppers } from '../calculators/drops';
import { QUEST_NOTES } from '../data/questNotes';
import { QUEST_LOG_TITLES } from '../data/questAliases';
import { JOBS } from '../data/rules';
import { useActive } from '../pages/shared';
import { homeTown, routeFromTown } from '../calculators/route';
import { href } from '../router';
import { fmt, SourceBadge, StatusPill } from './ui';
import { MapView, type Pin } from './MapView';

const questById = new Map(QUESTS.map((q) => [q.id, q]));

// The client's class bitmask on class-specific rewards.
const JOB_BITS: [number, string][] = [[1, 'Warrior'], [2, 'Magician'], [4, 'Bowman'], [8, 'Thief'], [16, 'Pirate']];
const jobsOf = (mask: number) => JOB_BITS.filter(([b]) => mask & b).map(([, name]) => name);

/** What the quest gives: EXP, mesos, fame, items (class-specific ones marked for your class). */
function Rewards({ q }: { q: Quest }) {
  const { character } = useActive();
  const family = character ? JOBS[character.job].family : null;
  const bits = [q.exp ? `${fmt(q.exp)} EXP` : '', q.meso ? `${fmt(q.meso)} mesos` : '', q.fame ? `+${q.fame} fame` : '', q.rewardSkills ? 'a skill' : ''].filter(Boolean);
  if (!bits.length && !q.rewardItems.length) return <p className="small muted" style={{ margin: 0 }}>No reward listed in the game files.</p>;
  const choice = q.rewardItems.some((i) => i.jobMask);
  return (
    <div>
      {bits.length > 0 && <p style={{ margin: '0 0 6px' }}><strong>{bits.join(' · ')}</strong></p>}
      {choice && <p className="small muted" style={{ margin: '0 0 4px' }}>One item for your class:</p>}
      {q.rewardItems.map((it, i) => {
        const jobs = it.jobMask ? jobsOf(it.jobMask) : [];
        const mine = !!family && jobs.includes(family);
        const item = itemById.get(it.itemId);
        return (
          <div key={`${it.itemId}-${i}`} className={`icon-row${it.jobMask && family && !mine ? ' dim' : ''}`} style={{ marginBottom: 4 }} title={item?.description}>
            <img src={IMG.item(it.itemId)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
            <span>
              {item?.name ?? `Item ${it.itemId}`}{it.count > 1 ? ` × ${it.count}` : ''}
              {jobs.length > 0 && <span className="small muted"> · {jobs.join('/')}</span>}
              {mine && <span className="pill accent" style={{ marginLeft: 6 }}>yours</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
/** Top maps for a monster; ids that share a name (event copies) are merged. */
function Where({ mobs }: { mobs: Monster[] }) {
  const counts = new Map<number, { name: string; count: number }>();
  for (const m of mobs) for (const sp of m.spawns) {
    const c = counts.get(sp.mapId) ?? { name: sp.mapName.split(': ').pop()!, count: 0 };
    c.count += sp.count;
    counts.set(sp.mapId, c);
  }
  const top = [...counts].sort((a, b) => b[1].count - a[1].count).slice(0, 3);
  if (!top.length) return null;
  return (
    <div className="small">
      <span className="muted">Found in:</span>{' '}
      {top.map(([id, c], i) => <span key={id}>{i > 0 && ', '}<a href={href('maps', { id })}>{c.name}</a> <span className="muted">({c.count})</span></span>)}
    </div>
  );
}

/** Who drops a collect item, as far as the game files' names tell, with where they live. */
function Droppers({ itemId }: { itemId: number }) {
  const found = likelyDroppers(itemById.get(itemId), MONSTERS);
  const byName = new Map<string, Monster[]>();
  for (const d of found) byName.set(d.mob.name, [...(byName.get(d.mob.name) ?? []), d.mob]);
  if (!byName.size) return <div className="small muted">Not a monster drop we can match. Usually from an NPC or made from other items.</div>;
  const clue = found[0].clue === 'item-name' ? 'The item is named after this monster' : "The item's description names this monster";
  return (
    <div className="droppers">
      {[...byName].map(([name, mobs]) => (
        <div key={name} className="dropper">
          <div className="icon-row">
            <img src={IMG.mob(mobs[0].id)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
            <span>
              <span className="muted" title={clue}>Likely from</span> <a href={href('monsters', { id: mobs[0].id })}><strong>{name}</strong></a>
              <span className="small muted"> Lv {mobs[0].level}</span>{' '}
              <a className="small" href={`https://meowdb.com/msclassic/monsters/${mobs[0].id}`} target="_blank" rel="noreferrer">drop list ↗</a>
            </span>
          </div>
          <Where mobs={mobs} />
        </div>
      ))}
    </div>
  );
}

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
            return home != null ? <>Nearest town: <a href={href('maps', { id: home })}>{mapById.get(home)?.name}</a></> : null;
          })()}

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
  // Maps the quest text names that aren't just where its NPCs stand ("go to Thicket Around the Beach III").
  const npcMaps = new Set([q.npcId, q.endNpcId].flatMap((id) => (id != null ? npcById.get(id)?.mapIds ?? [] : [])));
  const goMaps = q.mentionsMaps.filter((id) => !npcMaps.has(id) && id !== note?.mapId).map((id) => mapById.get(id)).filter((m): m is GameMap => !!m).slice(0, 2);
  // Monsters the text names but the requirements don't count (bosses like Mano).
  const named = q.mentionsMobs.filter((id) => !q.killMobs.some((k) => k.mobId === id));
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="card-head">
        <h2>{q.name}</h2>
        <SourceBadge source={q.source} compact />
      </div>
      {QUEST_LOG_TITLES[q.id] && <p className="small muted" style={{ margin: '-6px 0 6px' }}>In your quest log under <strong>{QUEST_LOG_TITLES[q.id]}</strong></p>}
      <p className="small" style={{ marginTop: 0 }}>
        Lv {q.minLevel || 1}+{q.exp ? ` · ${fmt(q.exp)} EXP` : ''}
        {q.availableUntil && <> · event, start before <strong>{q.availableUntil}</strong></>}
      </p>
      {q.hint && <p className="callout info" style={{ marginTop: 0 }}>Objective from the game: <em>“{q.hint}”</em></p>}
      {!q.hint && q.log && <p className="quest-log">{q.log}</p>}

      {note && (
        <div className="callout" style={{ marginBottom: 12 }}>
          <strong>Where to go</strong> {note.sources.map((s) => <SourceBadge key={s.source_url} source={s} compact />)}
          <p style={{ margin: '6px 0' }}>{note.where}</p>
          {note.alternatives?.map((a) => <p key={a} className="small" style={{ margin: '4px 0' }}><StatusPill status="conflicting" /> {a}</p>)}
          {noteMap && (
            <Place
              map={noteMap}
              pins={note.spot ? [{ ...note.spot, label: 'Go here', kind: 'spot' }] : []}
              caption={note.spot ? 'Circle placed from the guide below (not in the game files).' : 'Exact spot: see the guide picture (not in the game files).'}
            />
          )}
          {note.picture && (
            <p className="small" style={{ margin: '6px 0 0' }}>
              <a href={note.picture} target="_blank" rel="noreferrer">MeowDB's marked screenshot ↗</a>
            </p>
          )}
        </div>
      )}

      <div className="quest-detail">
        {q.npcId != null && <NpcPlace npcId={q.npcId} role={q.endNpcId ? 'Start: talk to' : 'Talk to (start and hand in)'} />}
        {q.endNpcId != null && <NpcPlace npcId={q.endNpcId} role="Hand in to" />}

        {goMaps.map((m) => {
          const bosses = (m.bossSpawns ?? []).filter((b) => q.mentionsMobs.includes(b.mobId));
          return (
            <div key={m.id}>
              <h3>Go to</h3>
              <Place map={m} pins={bosses.map((b) => ({ x: b.x, y: b.y, label: monsterById.get(b.mobId)?.name ?? 'boss', kind: 'mob' as const }))} />
            </div>
          );
        })}

        {(q.killMobs.length > 0 || q.collectItems.length > 0 || named.length > 0) && (
          <div>
            {named.length > 0 && <h3>Defeat</h3>}
            {named.map((id) => {
              const m = monsterById.get(id);
              return (
                <div key={id} className="icon-row" style={{ marginBottom: 8 }}>
                  <img src={IMG.mob(id)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                  <span>
                    <a href={href('monsters', { id })}>{m?.name ?? `Monster ${id}`}</a>
                    {m && <span className="small muted"> Lv {m.level} · {fmt(m.hp)} HP{m.isBoss ? ' · boss' : ''}</span>}
                  </span>
                </div>
              );
            })}
            {q.killMobs.length > 0 && <h3>Hunt</h3>}
            {q.killMobs.map((k) => {
              const m = monsterById.get(k.mobId);
              return (
                <div key={k.mobId} style={{ marginBottom: 8 }}>
                  <div className="icon-row">
                    <img src={IMG.mob(k.mobId)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                    <span><a href={href('monsters', { id: k.mobId })}>{m?.name ?? `Monster ${k.mobId}`}</a> × {k.count}</span>
                  </div>
                  {m && <Where mobs={MONSTERS.filter((x) => x.name === m.name)} />}
                </div>
              );
            })}
            {q.collectItems.length > 0 && <h3>Collect</h3>}
            {q.collectItems.map((it) => {
              const item = itemById.get(it.itemId);
              return (
                <div key={it.itemId} style={{ marginBottom: 12 }}>
                  <div className="icon-row" style={{ alignItems: 'flex-start' }}>
                    <img src={IMG.item(it.itemId)} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                    <span>
                      <strong>{item?.name ?? `Item ${it.itemId}`} × {it.count}</strong>
                      {item?.description && <span className="small muted" style={{ display: 'block' }}>{item.description}</span>}
                    </span>
                  </div>
                  <Droppers itemId={it.itemId} />
                </div>
              );
            })}
            {q.collectItems.length > 0 && <p className="small muted" style={{ margin: 0 }}>Drop tables aren't in the game files: monsters are matched by name, so confirm with the drop list.</p>}
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <h3>Rewards</h3>
        <Rewards q={q} />
      </div>

      {(prev.length > 0 || next.length > 0) && (
        <p className="small" style={{ marginBottom: 0 }}>
          {prev.length > 0 && <>Before: {prev.map((p) => <a key={p.id} href={href('quests', { id: p.id })} style={{ marginRight: 8 }}>{p.name}</a>)} </>}
          {next.length > 0 && <>Next: {next.map((n) => <a key={n.id} href={href('quests', { id: n.id })} style={{ marginRight: 8 }}>{n.name}</a>)}</>}
        </p>
      )}

    </div>
  );
}
