import { expForLevel, expRemaining } from '../data/expTable';
import { useMemo } from 'react';
import { IMG, skillById } from '../data';
import { JOBS } from '../data/rules';
import { href } from '../router';
import { fmt, minutes, ProvenancePill, Stat, StatusPill } from '../components/ui';
import { adviceFor, NeedCharacter, useActive, type PageProps } from './shared';
import { setActive, useAppState } from '../storage/store';
import { laneLabel, mainProvenance } from '../calculators/rank';

export default function Dashboard(_: PageProps) {
  const { character: c, assumptions } = useActive();
  const all = useAppState().characters;
  const advice = useMemo(() => (c ? adviceFor(c, assumptions) : null), [c, assumptions]);
  if (!c || !advice) return <NeedCharacter />;
  const job = JOBS[c.job];
  const skill = advice.skillId ? skillById.get(advice.skillId) : null;
  const best = advice.topMaps[0];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="char-pick">
            {all.length > 1 ? (
              <select value={c.id} onChange={(e) => setActive(e.target.value)} aria-label="Switch character">
                {all.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} · Lv {x.level} {JOBS[x.job].label}
                  </option>
                ))}
              </select>
            ) : (
              <>
                {c.name} <span className="muted">· Lv {c.level} {job.label}</span>
              </>
            )}
            <a className="btn small" href={href('characters', { new: 1 })} title="Add another character">+ New</a>
          </h1>
          <p>
            Main attack: <strong>{skill?.name ?? 'none'}</strong>
            {skill && ` Lv ${c.skills[skill.id] ?? 0}`} · {all.length} character{all.length === 1 ? '' : 's'} saved locally
          </p>
        </div>
        <div className="row">
          <a className="btn" href={href('characters', { id: c.id })}>Edit profile</a>
          <a className="btn primary" href={href('training')}>Open training calculator</a>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <Stat label="Best EXP / min (estimate)" value={best ? fmt(best.result.netExpPerMin) : '—'} sub={best ? best.map.name : 'no killable map'} />
        <Stat label="Time to next level" value={best ? minutes(best.result.minutesToLevel) : '—'} sub={<ExpToGo level={c.level} exp={c.currentExp ?? 0} />} />
        {advice.unspentAp > 0 && <Stat label="Unspent AP" value={fmt(advice.unspentAp)} sub="put it in using the advice below" />}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>What should I do next?</h2>
          <span className="small muted">Recalculates as you edit your profile</span>
        </div>
        <div className="grid grid-3">
          <section>
            <h3>Next SP</h3>
            {advice.sp.length === 0 && <p className="muted small">Beginner: no job skills yet.</p>}
            {advice.sp.map((block) => (
              <div key={block.tier} style={{ marginBottom: 8 }}>
                <div className="small muted">
                  {block.tier === 1 ? '1st' : '2nd'} job · {block.spent}/{block.available} SP used · {block.build?.name ?? 'no build'}{' '}
                  <StatusPill status="unverified" title="Proposed build order, not authoritative. Caps and prerequisites are verified game data." />
                </div>
                {block.next.length ? (
                  <ol className="next-list" style={{ marginTop: 6 }}>
                    {block.next.map((s, i) => (
                      <li key={i}>
                        <span className="step">{i + 1}</span>
                        <span>
                          <strong>{skillById.get(s.skillId)?.name}</strong> {s.from} → {s.to}
                          {s.why && <div className="small muted">{s.why}</div>}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="small muted">Build complete for this tier.</p>
                )}
              </div>
            ))}
            <a className="small" href={href('skills')}>Full SP plan →</a>
          </section>

          <section>
            <h3>Next 5 AP</h3>
            <ol className="next-list">
              {advice.ap.map((s, i) => (
                <li key={i}>
                  <span className="step">+{s.amount}</span>
                  <span>
                    <strong>{s.stat.toUpperCase()}</strong>
                    <div className="small muted">{s.reason}</div>
                  </span>
                </li>
              ))}
            </ol>
            <a className="small" href={href('skills', { tab: 'ap' })}>Set gear stat goals →</a>
          </section>

          <section>
            <h3>Best monsters to farm</h3>
            {advice.topMonsters.length === 0 && <p className="muted small">Nothing killable found. Check your attack skill and damage.</p>}
            <ol className="farm-list">
              {advice.topMonsters.map((g) => (
                <li key={g.mobId}>
                  <a className="farm-mob" href={href('monsters', { id: g.mobId })}>
                    <img src={IMG.mob(g.mobId)} alt="" loading="lazy" />
                    <span>
                      <strong>{g.name}</strong>
                      <span className="small muted"> {g.exp} EXP · {g.hits <= 1.05 ? '1 hit' : `${Math.round(g.hits * 10) / 10} hits`}</span>
                    </span>
                  </a>
                  {g.maps.map((r) => (
                    <a key={`${r.map.id}-${r.lane?.index ?? 'all'}`} className="farm-map" href={href('training', { map: r.map.id })}>
                      <span>
                        {r.map.name}
                        {r.lane && <span className="small muted"> · {laneLabel(r)}</span>}
                      </span>
                      <strong>{fmt(r.result.netExpPerMin)}<span className="small muted">/min</span></strong>
                    </a>
                  ))}
                </li>
              ))}
            </ol>
            {advice.topMaps[0] && <div className="small muted">Estimates <ProvenancePill p={mainProvenance(advice.topMaps[0])} /></div>}
          </section>
        </div>
      </div>

      {(advice.warnings.length > 0 || advice.issues.length > 0) && (
        <div className="card">
          <h3>Heads-up</h3>
          <ul className="notes" style={{ fontSize: 13 }}>
            {advice.issues.map((i, k) => (
              <li key={'i' + k} style={{ color: 'var(--bad)' }}>{i.message}</li>
            ))}
            {advice.warnings.map((w, k) => (
              <li key={'w' + k}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="small muted" style={{ marginTop: 16 }}>
        EXP/min depends on assumptions (attack speed, respawn time, downtime) that are{' '}
        <StatusPill status="unverified" /> for Classic World. Adjust them on the <a href={href('training')}>Training</a> page.
      </p>
    </>
  );
}

/** Like the in-game EXP bar: how far into this level, and the percent still to go. */
function ExpToGo({ level, exp }: { level: number; exp: number }) {
  const need = expForLevel(level);
  if (!need) return null;
  const done = Math.min(100, Math.max(0, (exp / need) * 100));
  return (
    <span title={`${fmt(expRemaining(level, exp))} EXP to go (${fmt(exp)} / ${fmt(need)})`}>
      <span className="exp-bar" aria-hidden>
        <span style={{ width: `${done}%` }} />
      </span>
      {fmt(100 - done, 1)}% to go
    </span>
  );
}
