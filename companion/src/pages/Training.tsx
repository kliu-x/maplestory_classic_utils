import { PastSessions, SessionRecorder } from '../components/SessionRecorder';
import { useMemo, useState } from 'react';
import type { TrainingAssumptions } from '../models/types';
import { attackSkillsForJob, mapById } from '../data';
import { rankMaps, evaluateMapFor, mainProvenance, laneLabel, type MapRow } from '../calculators/rank';
import { DEFAULT_ASSUMPTIONS, setAssumptions, upsertCharacter } from '../storage/store';
import { fmt, fmt1, minutes, NumField, ProvenancePill, StatusPill } from '../components/ui';
import { defaultAttackSkill, NeedCharacter, useActive, type PageProps } from './shared';
import { href } from '../router';

type SortKey = 'netExpPerMin' | 'expPerCast' | 'killsPerMin' | 'mesoCostPerMin';

export default function Training({ params }: PageProps) {
  const { character: c, assumptions: a } = useActive();
  const [skillId, setSkillId] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>('netExpPerMin');
  const [levelWindow, setLevelWindow] = useState(15);
  const [limit, setLimit] = useState(25);
  const [picked, setPicked] = useState<number[]>(() => (params.get('map') ? [Number(params.get('map'))] : []));
  const [open, setOpen] = useState<number | null>(params.get('map') ? Number(params.get('map')) : null);

  const sid = skillId ?? (c ? defaultAttackSkill(c) : null);
  const rows = useMemo(() => (c ? rankMaps(c, sid, a, { maxLevelAbove: levelWindow }) : []), [c, sid, a, levelWindow]);
  const sorted = useMemo(() => {
    const r = [...rows];
    if (sort === 'mesoCostPerMin') r.sort((x, y) => x.result.mesoCostPerMin - y.result.mesoCostPerMin);
    else r.sort((x, y) => y.result[sort] - x.result[sort] || y.result.killableShare - x.result.killableShare);
    return r;
  }, [rows, sort]);

  if (!c) return <NeedCharacter />;
  const attacks = attackSkillsForJob(c.job);
  const compareRows = picked
    .map((id) => rows.find((r) => r.map.id === id) ?? (mapById.get(id) ? evaluateMapFor(c, sid, mapById.get(id)!, a) : null))
    .filter((r): r is MapRow => !!r);

  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)));
  const th = (k: SortKey, label: string, title?: string) => (
    <th className="sortable num" title={title} onClick={() => setSort(k)}>
      {label}
      {sort === k ? ' ▾' : ''}
    </th>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Training</h1>
          <p>Maps ranked by estimated EXP per minute for {c.name}. Change damage or assumptions and everything recalculates.</p>
        </div>
        <div className="row">
          <label className="field">
            Attack
            <select value={sid ?? ''} onChange={(e) => setSkillId(Number(e.target.value))}>
              {attacks.map((s) => (
                <option key={s.skill.id} value={s.skill.id}>
                  {s.skill.name} (Lv {c.skills[s.skill.id] ?? 0})
                </option>
              ))}
            </select>
          </label>
          <NumField label="Max levels above you" value={levelWindow} min={0} max={60} width={80} onChange={setLevelWindow} />
        </div>
      </div>

      {sid != null && !(c.skills[sid] > 0) && (
        <p className="callout warn small">
          {c.name}'s profile has this attack at Lv 0, so nothing can be killed in the estimates.{' '}
          <button className="btn small" onClick={() => upsertCharacter({ ...c, followPlan: true, mainSkillId: sid })}>Fill skills from the plan for Lv {c.level}</button>{' '}
          or <a href={href('characters', { id: c.id })}>enter them yourself</a>.
        </p>
      )}

      <SessionRecorder c={c} a={a} skillId={sid} defaultMapId={rows[0]?.map.id ?? null} />

      <PastSessions c={c} />

      <Assumptions a={a} />

      {compareRows.length === 2 && <Compare rows={compareRows} />}

      <div className="card" style={{ padding: 0, marginTop: 16 }}>
        <div className="card-head" style={{ padding: '12px 16px 0' }}>
          <h2>Ranking</h2>
          <span className="small muted">Tick two maps to compare side by side · click a row for details</span>
        </div>
        <div className="table-wrap" style={{ border: 0, borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Map</th>
                <th>Monsters (spawn points)</th>
                {th('netExpPerMin', 'EXP/min', 'Net of travel and death penalty')}
                {th('expPerCast', 'EXP/cast', 'Efficiency per attack. Not the same as EXP/min')}
                {th('killsPerMin', 'Kills/min')}
                <th className="num">Casts/kill</th>
                <th>Limit</th>
                {th('mesoCostPerMin', 'Meso cost/min', 'Potions + stars')}
                <th>Damage</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, limit).map((r, i) => {
                const castsPerKill = r.result.killsPerMin > 0 ? r.result.castsPerMin / r.result.killsPerMin : Infinity;
                const prov = mainProvenance(r);
                return (
                  <FragmentRow key={r.map.id} open={open === r.map.id} row={r}>
                    <tr className={`clickable ${picked.includes(r.map.id) ? 'selected' : ''}`} onClick={() => setOpen(open === r.map.id ? null : r.map.id)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={picked.includes(r.map.id)} onChange={() => toggle(r.map.id)} aria-label={`Compare ${r.map.name}`} />
                      </td>
                      <td>
                        <span className="muted small">{i + 1}.</span> <strong>{r.map.name}</strong>
                        <div className="small muted">{r.map.street}</div>
                        {r.lane && (
                          <div className="small" title="Lanes are inferred from spawn positions in the map file (platform height and gaps).">
                            <span className="pill accent">{laneLabel(r)}</span>{' '}
                            <span className="muted">whole map {fmt(r.wholeMap?.netExpPerMin ?? 0)}/min</span>
                          </div>
                        )}
                      </td>
                      <td className="small">
                        {r.spawns.map((s, k) => (
                          <span key={s.mobId} style={s.eval.killsPerCast > 0 ? undefined : { color: 'var(--muted)', textDecoration: 'line-through' }} title={s.eval.killsPerCast > 0 ? undefined : 'Cannot be killed with this attack (0 damage or 0% hit chance)'}>
                            {k > 0 && ', '}
                            {s.name} ({s.spawnPoints})
                          </span>
                        ))}
                      </td>
                      <td className="num"><strong>{fmt(r.result.netExpPerMin)}</strong></td>
                      <td className="num">{fmt1(r.result.expPerCast)}</td>
                      <td className="num">{fmt1(r.result.killsPerMin)}</td>
                      <td className="num">{fmt1(castsPerKill)}</td>
                      <td>
                        <span className={`pill ${r.result.limitedBy === 'spawns' ? 'accent' : 'neutral'}`}>{r.result.limitedBy === 'spawns' ? 'spawns' : 'attack'}</span>
                      </td>
                      <td className="num">{fmt(r.result.mesoCostPerMin)}</td>
                      <td><ProvenancePill p={prov} /></td>
                    </tr>
                  </FragmentRow>
                );
              })}
            </tbody>
          </table>
          {sorted.length === 0 && <div className="empty">No killable maps in range. Check your attack skill, damage and the level window.</div>}
        </div>
        {sorted.length > limit && (
          <div style={{ padding: 12, textAlign: 'center' }}>
            <button className="btn" onClick={() => setLimit((l) => l + 25)}>Show more ({sorted.length - limit} left)</button>
          </div>
        )}
      </div>
    </>
  );
}

function FragmentRow({ children, open, row }: { children: React.ReactNode; open: boolean; row: MapRow }) {
  return (
    <>
      {children}
      {open && (
        <tr>
          <td colSpan={10} style={{ background: 'var(--surface-2)' }}>
            <MapDetail row={row} />
          </td>
        </tr>
      )}
    </>
  );
}

function MapDetail({ row }: { row: MapRow }) {
  const r = row.result;
  return (
    <div className="stack">
      <div className="detail-grid">
        <KV k="Gross EXP/min" v={fmt(r.grossExpPerMin)} />
        <KV k="Net EXP/hour" v={fmt(r.expPerHour)} />
        <KV k="Time to level" v={minutes(r.minutesToLevel)} />
        <KV k="Attack-limited kills/min" v={fmt1(r.attackKillsPerMin)} />
        <KV k="Spawn-limited kills/min" v={fmt1(r.spawnKillsPerMin)} />
        <KV k="Casts/min (used)" v={fmt1(r.castsPerMin)} />
        <KV k="MP/min" v={fmt(r.mpPerMin)} />
        <KV k="Stars/min" v={fmt1(r.starsPerMin)} />
        <KV k="Mesos/min: MP / HP / stars" v={`${fmt(r.costBreakdown.mp)} / ${fmt(r.costBreakdown.hp)} / ${fmt(r.costBreakdown.stars)}`} />
        <KV k="Travel factor" v={fmt(r.travelFactor * 100) + '%'} />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Monster</th><th className="num">Spawns</th><th className="num">EXP</th><th className="num">Dmg/line (min–max)</th><th className="num">Lines</th>
              <th className="num">Hit</th><th className="num">Casts to kill (best / exp / p90)</th><th className="num">Targets</th><th>Source of damage</th>
            </tr>
          </thead>
          <tbody>
            {row.spawns.map((s) => (
              <tr key={s.mobId}>
                <td><a href={href('monsters', { id: s.mobId })}>{s.name}</a></td>
                <td className="num">{s.spawnPoints}</td>
                <td className="num">{s.exp}</td>
                <td className="num">{fmt(s.atk.line.min)}–{fmt(s.atk.line.max)}</td>
                <td className="num">{s.atk.linesPerCast}</td>
                <td className="num">{fmt(s.atk.line.hitRate * 100)}%</td>
                <td className="num">
                  {fmt(s.eval.kill.best)} / <strong>{fmt1(s.eval.kill.expected)}</strong> / {fmt(s.eval.kill.p90)}
                </td>
                <td className="num">{s.eval.targets}</td>
                <td>
                  <ProvenancePill p={s.atk.provenance} />
                  <ul className="notes">{s.atk.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {r.notes.length > 0 && <ul className="notes">{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
      <div className="small muted">
        Map data: {row.map.width}×{row.map.height}px, mobRate {row.map.mobRate}, {row.map.portalsTo.length} exits. <a href={row.map.source.source_url} target="_blank" rel="noreferrer">source</a>{' '}
        <StatusPill status={row.map.source.verification_status} />
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="kv">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function Compare({ rows }: { rows: MapRow[] }) {
  const [x, y] = rows;
  const line = (label: string, f: (r: MapRow) => number, digits = 0, lowerBetter = false) => {
    const a = f(x);
    const b = f(y);
    const better = (v: number, o: number) => (lowerBetter ? v < o : v > o);
    return (
      <>
        <div className="muted">{label}</div>
        <div className={`num ${better(a, b) ? 'better' : ''}`}>{fmt(a, digits)}</div>
        <div className={`num ${better(b, a) ? 'better' : ''}`}>{fmt(b, digits)}</div>
      </>
    );
  };
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h2>Side by side</h2>
      <div className="compare">
        <div className="h"></div>
        <div className="h">{x.map.name}</div>
        <div className="h">{y.map.name}</div>
        {line('Net EXP/min', (r) => r.result.netExpPerMin)}
        {line('EXP/cast', (r) => r.result.expPerCast, 1)}
        {line('EXP/kill (avg)', (r) => r.result.expPerKill, 1)}
        {line('Kills/min', (r) => r.result.killsPerMin, 1)}
        {line('Attack-limited kills/min', (r) => r.result.attackKillsPerMin, 1)}
        {line('Spawn-limited kills/min', (r) => r.result.spawnKillsPerMin, 1)}
        {line('Spawn points', (r) => r.spawns.reduce((t, s) => t + s.spawnPoints, 0))}
        {line('Meso cost/min', (r) => r.result.mesoCostPerMin, 0, true)}
        {line('MP/min', (r) => r.result.mpPerMin, 0, true)}
        <div className="muted">Limited by</div>
        <div>{x.result.limitedBy}</div>
        <div>{y.result.limitedBy}</div>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>Both columns use the same assumptions below. A map can win EXP/cast and still lose EXP/min if it is spawn-limited.</p>
    </div>
  );
}

function Assumptions({ a }: { a: TrainingAssumptions }) {
  const set = (p: Partial<TrainingAssumptions>) => setAssumptions(p);
  const U = () => <StatusPill status="unverified" title="Not verified for Classic World. Adjust to your own experience." />;
  return (
    <details className="card">
      <summary>
        <strong>Estimate settings</strong>{' '}
        <span className="small muted">
          how the ranking below guesses EXP/min where you haven't recorded: {a.castsPerSecond} casts/s · {Math.round(a.uptime * 100)}% attacking · {a.respawnSeconds}s respawn — click to edit
        </span>
      </summary>
      <div className="fields" style={{ marginTop: 12 }}>
        <NumField label={<>Casts / second <U /></>} value={a.castsPerSecond} step={0.05} min={0.1} onChange={(v) => set({ castsPerSecond: v })} title="Your real attack rate including animation delay." />
        <NumField label="Uptime %" value={Math.round(a.uptime * 100)} min={5} max={100} onChange={(v) => set({ uptime: v / 100 })} title="Share of time spent attacking (rest is moving, looting, sitting)." />
        <NumField label={<>Respawn (s) <U /></>} value={a.respawnSeconds} min={1} onChange={(v) => set({ respawnSeconds: v })} title="Seconds for a killed monster's spawn point to refill." />
        <NumField label="Reachable spawns %" value={Math.round(a.spawnShare * 100)} min={1} max={100} onChange={(v) => set({ spawnShare: v / 100 })} title="Share of the map's spawn points you can realistically keep clearing (map size, other players)." />
        <NumField label="Reachable on one lane %" value={Math.round(a.laneSpawnShare * 100)} min={1} max={100} onChange={(v) => set({ laneSpawnShare: v / 100 })} title="Same, when you stay on one platform. Higher than the whole map because you never leave it." />
        <label className="check" title="Also rank single lanes (platforms). A lane wins when staying on it earns more than roaming the whole map.">
          <input type="checkbox" checked={a.useLanes !== false} onChange={(e) => set({ useLanes: e.target.checked })} /> Rank single lanes
        </label>
        <NumField label="Pack size (multi-target)" value={a.packSize} min={1} max={6} onChange={(v) => set({ packSize: v })} title="Monsters typically in range for skills like Thunder Bolt (capped by the skill)." />
        <NumField label="Session (min)" value={a.sessionMinutes} min={1} onChange={(v) => set({ sessionMinutes: v })} />
        <NumField label="Travel (min)" value={a.travelMinutes} min={0} onChange={(v) => set({ travelMinutes: v })} />
        <NumField label="Deaths / hour" value={a.deathsPerHour} min={0} step={0.1} onChange={(v) => set({ deathsPerHour: v })} />
        <NumField label={<>EXP lost / death % <U /></>} value={a.deathExpLossPct} min={0} max={100} onChange={(v) => set({ deathExpLossPct: v })} />
        <NumField label="MP potion: MP" value={a.mpPotionMp} min={1} onChange={(v) => set({ mpPotionMp: v })} />
        <NumField label={<>MP potion price <U /></>} value={a.mpPotionPrice} min={0} onChange={(v) => set({ mpPotionPrice: v })} />
        <NumField label="HP lost / min" value={a.hpPotionHpPerMin} min={0} onChange={(v) => set({ hpPotionHpPerMin: v })} title="HP you burn per minute from damage taken (refilled by potions)." />
        <NumField label="HP potion: HP" value={a.hpPotionHp} min={1} onChange={(v) => set({ hpPotionHp: v })} />
        <NumField label={<>HP potion price <U /></>} value={a.hpPotionPrice} min={0} onChange={(v) => set({ hpPotionPrice: v })} />
        <NumField label={<>Star recharge / star <U /></>} value={a.starRechargePricePerStar} min={0} step={0.1} onChange={(v) => set({ starRechargePricePerStar: v })} />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <label className="check"><input type="checkbox" checked={a.adjustForDefense} onChange={(e) => set({ adjustForDefense: e.target.checked })} /> Monster defense <StatusPill status="community_reported" /></label>
        <label className="check"><input type="checkbox" checked={a.adjustForLevelGap} onChange={(e) => set({ adjustForLevelGap: e.target.checked })} /> Level-gap penalty <StatusPill status="community_reported" /></label>
        <label className="check"><input type="checkbox" checked={a.adjustForAccuracy} onChange={(e) => set({ adjustForAccuracy: e.target.checked })} /> Accuracy / misses <StatusPill status="community_reported" /></label>
        <label className="check">
          <input type="checkbox" checked={a.adjustForElement} onChange={(e) => set({ adjustForElement: e.target.checked })} /> Elemental weakness <StatusPill status="conflicting" title="Weak = x1.25 (MeowDB) vs x1.5 (legacy convention)" />
        </label>
        {a.adjustForElement && (
          <select value={a.elementModel} onChange={(e) => set({ elementModel: e.target.value as 'meowdb' | 'legacy' })}>
            <option value="meowdb">Weak x1.25 (MeowDB)</option>
            <option value="legacy">Weak x1.5 (legacy pre-BB)</option>
          </select>
        )}
        <span className="spacer" />
        <button className="btn small" onClick={() => setAssumptions({ ...DEFAULT_ASSUMPTIONS })}>Reset defaults</button>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>
        Model: kills/min = min(attack-limited, spawn-limited). Attack-limited = casts/s × 60 × uptime × targets ÷ casts-to-kill. Spawn-limited = spawn points × reachable % × 60 ÷ respawn.
        Spawn points come from the map files <StatusPill status="verified" />; respawn timing does not.
      </p>
    </details>
  );
}
