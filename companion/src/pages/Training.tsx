import { PastSessions, SessionRecorder } from '../components/SessionRecorder';
import { useMemo, useState } from 'react';
import type { TrainingAssumptions } from '../models/types';
import { IMG, attackSkillsForJob } from '../data';
import { rankMaps, mainProvenance, laneLabel, type MapRow } from '../calculators/rank';
import { DEFAULT_ASSUMPTIONS, setAssumptions, upsertCharacter } from '../storage/store';
import { fmt, fmt1, minutes, NumField, ProvenancePill, StatusPill } from '../components/ui';
import { defaultAttackSkill, NeedCharacter, useActive, type PageProps } from './shared';
import { href } from '../router';

export default function Training({ params }: PageProps) {
  const { character: c, assumptions: a } = useActive();
  const [skillId, setSkillId] = useState<number | null>(null);
  const [levelWindow, setLevelWindow] = useState(15);
  const [limit, setLimit] = useState(5);
  const [open, setOpen] = useState<number | null>(params.get('map') ? Number(params.get('map')) : null);

  const sid = skillId ?? (c ? defaultAttackSkill(c) : null);
  const rows = useMemo(() => (c ? rankMaps(c, sid, a, { maxLevelAbove: levelWindow }) : []), [c, sid, a, levelWindow]);
  if (!c) return <NeedCharacter />;
  const attacks = attackSkillsForJob(c.job);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Training</h1>
          <p>Where {c.name} should train.</p>
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

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-head">
          <h2>Where to train</h2>

        </div>
        <ol className="rank-list">
          {rows.slice(0, limit).map((r, i) => {
            const mine = (c.sessions ?? []).filter((s) => s.mapId === r.map.id && !s.party).map((s) => s.expPerActiveMin);
            const isOpen = open === r.map.id;
            return (
              <li key={`${r.map.id}-${r.lane?.index ?? 'all'}`} className={`rank-item ${i === 0 ? 'top' : ''}`}>
                <button className="rank-row" onClick={() => setOpen(isOpen ? null : r.map.id)} aria-expanded={isOpen}>
                  <span className="rank-n">{i + 1}</span>
                  <span className="rank-main">
                    <strong title={r.map.street}>{r.map.name}</strong>
                    {r.lane && <span className="small muted" title="Stay on this platform: it beats roaming the whole map.">{laneLabel(r)}</span>}
                    <span className="rank-mobs">
                      {r.spawns.filter((sp) => sp.eval.killsPerCast > 0).map((sp) => {
                        const hits = sp.eval.kill.expected;
                        return (
                          <span key={sp.mobId} className={`mob-chip ${sp.eval.killsPerCast > 0 ? '' : 'off'}`} title={sp.eval.killsPerCast > 0 ? `${sp.spawnPoints} spawn points, ${sp.exp} EXP each` : "Can't be killed with this attack"}>
                            <img src={IMG.mob(sp.mobId)} alt="" loading="lazy" />
                            {sp.name} <span className="muted">{sp.eval.killsPerCast > 0 ? (hits <= 1.05 ? '1 hit' : `${Math.abs(hits - Math.round(hits)) < 0.05 ? Math.round(hits) : fmt1(hits)} hits`) : '✕'}</span>
                          </span>
                        );
                      })}
                    </span>
                  </span>
                  <span className="rank-rate">
                    <span className="value">{fmt(r.result.netExpPerMin)}<span className="small muted">/min</span></span>
                    {mine.length > 0 && <span className="pill verified" title="Your best solo session here (party runs left out)">you: {fmt(Math.max(...mine))}</span>}
                  </span>
                </button>
                {isOpen && (
                  <div className="rank-detail">
                    <MapDetail row={r} />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {rows.length === 0 && <div className="empty">No killable maps in range. Check your attack skill and its level.</div>}
        {rows.length > limit && (
          <div style={{ textAlign: 'center' }}>
            <button className="btn" onClick={() => setLimit((l) => l + 5)}>Show more maps</button>
          </div>
        )}
        <p className="small muted" style={{ margin: '8px 0 0' }}>
          Estimates <ProvenancePill p={rows[0] ? mainProvenance(rows[0]) : 'estimated'} /> · click a map for details
        </p>
      </div>
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
