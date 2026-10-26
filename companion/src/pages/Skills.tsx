import { useState } from 'react';
import type { Character, JobId, Skill, StatKey } from '../models/types';
import { JOBS, RULES, jobTierOfGameJob } from '../data/rules';
import { skillById, skillsForJob } from '../data';
import { buildsFor, type Build } from '../data/builds';
import { finalAllocation, levelTable, nextSp } from '../calculators/planner';
import { spPools, spentByTier, validateAllocation } from '../calculators/sp';
import { apNeeds, suggestAp, unspentAp } from '../calculators/ap';
import { upsertCharacter } from '../storage/store';
import { href } from '../router';
import { NumField, SourceBadge, StatusPill } from '../components/ui';
import { NeedCharacter, activeBuild, useActive, type PageProps } from './shared';

export default function SkillsPage({ params }: PageProps) {
  const { character: c } = useActive();
  const [tab, setTab] = useState<'sp' | 'ap' | 'ref'>(params.get('tab') === 'ap' ? 'ap' : params.get('skill') ? 'ref' : 'sp');
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Skills &amp; AP</h1>
          <p>Caps and prerequisites are Classic World game data. Build <em>orders</em> are proposals.</p>
        </div>
        <div className="seg">
          <button className={tab === 'sp' ? 'on' : ''} onClick={() => setTab('sp')}>SP plan</button>
          <button className={tab === 'ap' ? 'on' : ''} onClick={() => setTab('ap')}>AP plan</button>
          <button className={tab === 'ref' ? 'on' : ''} onClick={() => setTab('ref')}>Skill reference</button>
        </div>
      </div>
      {tab === 'ref' ? <Reference job={c?.job ?? 'magician'} highlight={Number(params.get('skill')) || null} /> : !c ? <NeedCharacter /> : tab === 'sp' ? <SpPlan c={c} /> : <ApPlan c={c} />}
    </>
  );
}

function SpPlan({ c }: { c: Character }) {
  const job = JOBS[c.job];
  const [tier, setTier] = useState<1 | 2>(job.tier === 2 ? 2 : 1);
  if (job.tier === 0) return <div className="card">Beginners have no job skills. Advance at Lv {RULES.firstJobLevel.value}.</div>;
  if (!job.plannerSupported) return <div className="card">No proposed builds for {job.label} yet; the skill reference tab still shows caps and prerequisites.</div>;
  const builds = buildsFor(c.job, tier);
  const build = activeBuild(c, tier);
  const pools = spPools(c.level, job.tier);
  const spent = spentByTier(c.skills);
  const issues = validateAllocation(skillsForJob(c.job, true), c.skills, c.level, job.tier);
  const available = tier === 1 ? pools.first : pools.second;
  const used = tier === 1 ? spent.first : spent.second;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card">
        <div className="row">
          {job.tier === 2 && (
            <div className="seg">
              <button className={tier === 1 ? 'on' : ''} onClick={() => setTier(1)}>1st job</button>
              <button className={tier === 2 ? 'on' : ''} onClick={() => setTier(2)}>2nd job</button>
            </div>
          )}
          <span><strong>{used}</strong> / {available} SP used at Lv {c.level}</span>
          {pools.pendingSecond > 0 && <span className="pill accent">{pools.pendingSecond} SP waiting for 2nd job</span>}
          <span className="spacer" />
          <span className="small muted">
            SP rules: {RULES.spPerLevel.value}/level from Lv 11, +{RULES.spAtAdvancement.value} at advancement <SourceBadge source={RULES.spPerLevel.source} compact />
          </span>
        </div>
        {issues.length > 0 && <div className="callout bad" style={{ marginTop: 10 }}>{issues.map((i, k) => <div key={k}>{i.message}</div>)}</div>}
      </div>

      <div className="grid grid-2">
        {builds.map((b) => (
          <BuildCard key={b.id} b={b} active={build?.id === b.id} c={c} />
        ))}
      </div>

      {build && <LevelTable b={build} c={c} />}
    </div>
  );
}

function BuildCard({ b, active, c }: { b: Build; active: boolean; c: Character }) {
  const next = nextSp(b, c.skills, 3);
  const final = finalAllocation(b);
  return (
    <div className="card" style={active ? { borderColor: 'var(--accent)' } : undefined}>
      <div className="card-head">
        <h3>{b.name}</h3>
        <div className="row">
          <StatusPill status="unverified" title="Proposed build: order is an opinion, not authoritative." />
          {active ? <span className="pill accent">active</span> : <button className="btn small" onClick={() => upsertCharacter({ ...c, buildId: b.id })}>Use</button>}
        </div>
      </div>
      <p className="small muted">{b.summary}</p>
      <div className="small"><strong>Next 3 SP:</strong> {next.length ? next.map((s) => `${skillById.get(s.skillId)?.name} ${s.to}`).join(' → ') : 'complete'}</div>
      <div className="small muted" style={{ marginTop: 4 }}>
        Final: {Object.entries(final).map(([id, lv]) => `${skillById.get(Number(id))?.name} ${lv}`).join(', ')}
      </div>
    </div>
  );
}

function LevelTable({ b, c }: { b: Build; c: Character }) {
  const rows = levelTable(b, RULES.maxLevel.value).filter((r) => r.points.length || r.unspent);
  const firstUnspent = rows.find((r) => r.unspent > 0);
  return (
    <div className="card">
      <div className="card-head">
        <h3>Level-by-level: {b.name}</h3>
        <StatusPill status="unverified" title="Proposed build" />
      </div>
      <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
        <table>
          <thead><tr><th className="num">Level</th><th className="num">SP</th><th>Put points into</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.level} className={r.level === c.level ? 'selected' : ''}>
                <td className="num">{r.level}{r.level === c.level ? ' ◀' : ''}</td>
                <td className="num">{r.sp}</td>
                <td className="small">
                  {r.points.map((p) => `${skillById.get(p.skillId)?.name} → ${p.to}`).join(', ')}
                  {r.unspent > 0 && <span className="muted"> {r.points.length ? '+ ' : ''}{r.unspent} unspent</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {firstUnspent && b.tier === 2 && (
        <p className="small muted" style={{ marginTop: 6 }}>
          Every 2nd-job skill is maxed by Lv {firstUnspent.level}. Later SP has nowhere to go until 3rd job, which is not in the launch build <SourceBadge source={RULES.thirdJobAvailable.source} compact />.
        </p>
      )}
    </div>
  );
}

function ApPlan({ c }: { c: Character }) {
  const job = JOBS[c.job];
  const goals = c.statGoals ?? {};
  const needs = apNeeds(c.base, c.equip, goals);
  const next = suggestAp(job, c.base, c.equip, goals);
  const totalNeeded = needs.reduce((t, n) => t + (n.stat === job.primaryStat ? 0 : n.needed), 0);
  const free = Math.max(0, unspentAp(c.level, c.base));
  const stats: StatKey[] = ['str', 'dex', 'int', 'luk'];
  return (
    <div className="grid grid-2">
      <div className="card">
        <h3>Gear stat goals</h3>
        <p className="small muted">
          Enter the <strong>total</strong> stat an item you want needs (base + equipment). Equipment bonuses count toward requirements, so they reduce the base AP you must spend, but if you
          take that gear off you may no longer meet the requirement.
        </p>
        <div className="fields">
          {stats.map((s) => (
            <NumField
              key={s}
              label={`${s.toUpperCase()} goal${s === job.primaryStat ? ' (main)' : ''}`}
              value={goals[s] ?? 0}
              min={0}
              onChange={(v) => upsertCharacter({ ...c, statGoals: { ...goals, [s]: v || undefined } })}
            />
          ))}
        </div>
        {needs.length > 0 && (
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>Stat</th><th className="num">Goal</th><th className="num">Base</th><th className="num">Equip</th><th className="num">Base AP needed</th></tr></thead>
              <tbody>
                {needs.map((n) => (
                  <tr key={n.stat}>
                    <td>{n.stat.toUpperCase()}</td><td className="num">{n.goalTotal}</td><td className="num">{n.base}</td><td className="num">{n.equip}</td>
                    <td className="num"><strong>{n.needed}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalNeeded > 0 && (
          <p className="small" style={{ marginTop: 8 }}>
            Secondary stats need <strong>{totalNeeded}</strong> AP ≈ {Math.ceil(Math.max(0, totalNeeded - free) / RULES.apPerLevel.value)} more level(s) of AP.
          </p>
        )}
      </div>
      <div className="card">
        <h3>Next {RULES.apPerLevel.value} AP</h3>
        <ol className="next-list">
          {next.map((s, i) => (
            <li key={i}>
              <span className="step">+{s.amount}</span>
              <span><strong>{s.stat.toUpperCase()}</strong><div className="small muted">{s.reason}</div></span>
            </li>
          ))}
        </ol>
        <p className="small muted" style={{ marginTop: 10 }}>
          Rule of thumb used here (a proposal <StatusPill status="unverified" />): put only enough into secondary stats to wear your next gear, everything else into{' '}
          {job.primaryStat.toUpperCase()}. {RULES.apPerLevel.value} AP per level <SourceBadge source={RULES.apPerLevel.source} compact />.
        </p>
        <p className="small"><a href={href('gear')}>Compare a gear upgrade →</a></p>
      </div>
    </div>
  );
}

function Reference({ job: initial, highlight }: { job: JobId; highlight: number | null }) {
  const hJob = highlight ? (Object.keys(JOBS) as JobId[]).find((j) => JOBS[j].gameJobIds.includes(Math.floor(highlight / 10000))) : undefined;
  const [job, setJob] = useState<JobId>(hJob ?? initial);
  const [open, setOpen] = useState<number | null>(highlight);
  const skills = skillsForJob(job, true);
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <label className="field">
          Job
          <select value={job} onChange={(e) => setJob(e.target.value as JobId)}>
            {(Object.keys(JOBS) as JobId[]).filter((j) => JOBS[j].tier > 0).map((j) => <option key={j} value={j}>{JOBS[j].label}</option>)}
          </select>
        </label>
        <span className="spacer" />
        {skills[0] && <SourceBadge source={skills[0].source} />}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Skill</th><th>Tier</th><th className="num">Max</th><th>Requires</th><th>At max level</th></tr></thead>
          <tbody>
            {skills.map((s) => (
              <SkillRow key={s.id} s={s} open={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 8 }}>3rd-job skillbooks are not in the Classic World launch data (the API returns errors for them).</p>
    </div>
  );
}

function keyValues(l: Skill['levels'][number] | undefined) {
  if (!l) return '';
  const r = l.raw;
  const parts: string[] = [];
  if (l.mad) parts.push(`MAD ${l.mad}`);
  if (l.damage) parts.push(`${l.damage}% dmg`);
  if (l.attackCount && l.attackCount > 1) parts.push(`${l.attackCount} hits`);
  if (l.bulletCount && l.bulletCount > 1) parts.push(`${l.bulletCount} stars`);
  if (l.mobCount && l.mobCount > 1) parts.push(`${l.mobCount} targets`);
  if (l.mpCon) parts.push(`${l.mpCon} MP`);
  for (const k of ['x', 'accX', 'evaX', 'indieMad', 'mastery', 'crtX', 'crdX', 'range', 'time']) if (r[k]) parts.push(`${k} ${r[k]}`);
  return parts.join(' · ');
}

function SkillRow({ s, open, onClick }: { s: Skill; open: boolean; onClick: () => void }) {
  return (
    <>
      <tr className={`clickable ${open ? 'selected' : ''}`} onClick={onClick}>
        <td><strong>{s.name}</strong>{s.hidden && <span className="pill neutral"> hidden</span>}</td>
        <td>{jobTierOfGameJob(s.jobId) === 1 ? '1st' : '2nd'}</td>
        <td className="num">{s.masterLevel}</td>
        <td className="small">{s.prereqs.map((p) => `${skillById.get(p.skillId)?.name ?? p.skillId} ${p.level}`).join(', ') || '—'}</td>
        <td className="small">{keyValues(s.levels[s.levels.length - 1])}</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} style={{ background: 'var(--surface-2)' }}>
            <p style={{ whiteSpace: 'pre-line' }} className="small">{s.description}</p>
            <div className="table-wrap" style={{ maxHeight: 300, overflowY: 'auto' }}>
              <table>
                <thead><tr><th className="num">Lv</th><th>Values</th></tr></thead>
                <tbody>{s.levels.map((l) => <tr key={l.level}><td className="num">{l.level}</td><td className="small">{keyValues(l)}</td></tr>)}</tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
