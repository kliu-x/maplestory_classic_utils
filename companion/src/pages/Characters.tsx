import { useEffect, useMemo, useRef, useState } from 'react';
import type { Character, DamageObservation, JobId, StatKey, Stats } from '../models/types';
import { JOBS, RULES, jobTierOfGameJob } from '../data/rules';
import { MONSTERS, attackSkillsForJob, monsterById, skillsForJob } from '../data';
import { buildsFor } from '../data/builds';
import { spPools, spentByTier, validateAllocation } from '../calculators/sp';
import { expectedBase, startingStats, unspentAp } from '../calculators/ap';
import { EXP_TABLE_SOURCE, expForLevel, expRemaining } from '../data/expTable';
import { decodeCharacter, deleteCharacter, encodeCharacter, exportJson, importJson, newCharacter, newObservationId, setActive, upsertCharacter, useAppState } from '../storage/store';
import { go, href } from '../router';
import { Empty, NumField, fmt, StatusPill } from '../components/ui';
import type { PageProps } from './shared';

const STATS: StatKey[] = ['str', 'dex', 'int', 'luk'];
const JOB_IDS = Object.keys(JOBS) as JobId[];

export default function Characters({ params }: PageProps) {
  const state = useAppState();
  const created = useRef(false);
  useEffect(() => {
    if (params.get('new') && !created.current) {
      created.current = true;
      const c = newCharacter('magician', `Character ${state.characters.length + 1}`);
      upsertCharacter(c);
      go('characters', { id: c.id });
    }
  }, [params, state.characters.length]);

  const received = useRef(false);
  const [shareMsg, setShareMsg] = useState('');
  useEffect(() => {
    const code = params.get('share');
    if (!code || received.current) return;
    received.current = true;
    try {
      const c = decodeCharacter(code);
      const existing = state.characters.find((x) => x.id === c.id);
      const ok = confirm(existing ? `Replace ${existing.name} on this device with the shared copy (Lv ${c.level})?` : `Add ${c.name} (Lv ${c.level} ${JOBS[c.job].label}) to this device?`);
      if (ok) {
        upsertCharacter(c);
        setActive(c.id);
        go('characters', { id: c.id });
      } else go('characters');
    } catch {
      setShareMsg('That share link is damaged or incomplete. Send it again.');
      go('characters');
    }
  }, [params, state.characters]);

  const selectedId = params.get('id') ?? state.settings.activeCharacterId;
  const c = state.characters.find((x) => x.id === selectedId) ?? state.characters[0] ?? null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Characters</h1>
          <p>Profiles are stored only in this browser. Use <strong>Send to another device</strong> to copy one to your phone or PC.</p>
          {shareMsg && <p className="small" style={{ color: 'var(--warn)' }}>{shareMsg}</p>}
        </div>
        <ImportExport />
      </div>
      <div className="grid split">
        <div className="card stack" style={{ padding: 10 }}>
          {state.characters.map((x) => (
            <a
              key={x.id}
              href={href('characters', { id: x.id })}
              onClick={() => setActive(x.id)}
              className={`nav-link ${c?.id === x.id ? 'active' : ''}`}
              style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 0 }}
            >
              <strong>{x.name}</strong>
              <span className="small muted">
                Lv {x.level} {JOBS[x.job].label}
              </span>
            </a>
          ))}
          <div className="row" style={{ padding: 4 }}>
            <button className="btn small" onClick={() => add('magician')}>+ Magician</button>
            <button className="btn small" onClick={() => add('thief')}>+ Thief</button>
            <button className="btn small" onClick={() => add('beginner')}>+ Other</button>
          </div>
        </div>
        {c ? <Editor key={c.id} c={c} /> : <Empty>Create your first character.</Empty>}
      </div>
    </>
  );

  function add(job: JobId) {
    const ch = newCharacter(job, `${JOBS[job].label} ${state.characters.length + 1}`);
    upsertCharacter(ch);
    go('characters', { id: ch.id });
  }
}

function ImportExport() {
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  return (
    <div className="row">
      {msg && <span className="small muted">{msg}</span>}
      <button
        className="btn"
        onClick={() => {
          const blob = new Blob([exportJson()], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `mcw-companion-backup-${new Date().toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(a.href);
        }}
      >
        Export JSON
      </button>
      <button className="btn" onClick={() => file.current?.click()}>Import JSON</button>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            if (!confirm('Importing replaces all characters and settings in this browser. Continue?')) return;
            const s = importJson(await f.text());
            setMsg(`Imported ${s.characters.length} character(s).`);
          } catch (err) {
            setMsg(`Import failed: ${(err as Error).message}`);
          } finally {
            e.target.value = '';
          }
        }}
      />
    </div>
  );
}

function Editor({ c }: { c: Character }) {
  const update = (patch: Partial<Character>) => upsertCharacter({ ...c, ...patch });
  // Typing a skill or stat by hand means you are off-plan; stop overwriting it.
  const manual = (patch: Partial<Character>) => update({ ...patch, followPlan: false });
  const job = JOBS[c.job];
  const attacks = attackSkillsForJob(c.job);
  const ap = unspentAp(c.level, c.base);
  const levelExp = expForLevel(c.level);
  const sameStats = (a: Stats, b: Stats) => STATS.every((s) => a[s] === b[s]);
  // Base stats still at the default follow level/job changes; edited ones are left alone.
  const atDefault = sameStats(c.base, expectedBase(c.job, c.level));
  const setLevel = (v: number) => {
    const level = Math.max(1, Math.min(RULES.maxLevel.value, Math.round(v)));
    update({ level, ...(atDefault ? { base: expectedBase(c.job, level) } : {}) });
  };

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card">
        <div className="card-head">
          <h2>Profile</h2>
          <span className="spacer" />
          <ShareButton c={c} />
          <button
            className="btn small danger"
            onClick={() => {
              if (confirm(`Delete ${c.name}? This cannot be undone (export a backup first).`)) deleteCharacter(c.id);
            }}
          >
            Delete
          </button>
        </div>
        <div className="fields">
          <label className="field" style={{ gridColumn: 'span 2' }}>
            Name
            <input type="text" value={c.name} onChange={(e) => update({ name: e.target.value })} />
          </label>
          <label className="field" style={{ gridColumn: 'span 2' }}>
            Job
            <select value={c.job} onChange={(e) => {
              const j = e.target.value as JobId;
              update({ job: j, buildId: undefined, mainSkillId: null, ...(atDefault ? { base: expectedBase(j, c.level) } : {}) });
            }}>
              {JOB_IDS.map((j) => (
                <option key={j} value={j}>
                  {JOBS[j].label}
                  {JOBS[j].plannerSupported ? '' : ' (no build planner yet)'}
                </option>
              ))}
            </select>
          </label>
          <NumField label="Level" value={c.level} min={1} max={RULES.maxLevel.value} onChange={setLevel} />
          <NumField
            label={levelExp ? `Current EXP (of ${fmt(levelExp)})` : 'Current EXP'}
            value={c.currentExp ?? 0}
            min={0}
            max={levelExp || undefined}
            onChange={(v) => update({ currentExp: Math.max(0, Math.round(v)) })}
            title="The EXP number on your in-game EXP bar. EXP needed per level comes from a community table."
          />
          <NumField label="Max HP" value={c.hp} min={0} onChange={(v) => update({ hp: v })} />
          <NumField label="Max MP" value={c.mp} min={0} onChange={(v) => update({ mp: v })} />
        </div>

        <label className={`callout ${c.followPlan ? 'info' : ''}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!c.followPlan} onChange={(e) => update({ followPlan: e.target.checked })} style={{ marginTop: 3 }} />
          <span>
            <strong>I follow the plan</strong>: fill in my skills and stats automatically from my level.
            <span className="small muted" style={{ display: 'block' }}>
              {c.followPlan
                ? 'Just update your level (and EXP). Skills follow the SP build for your main attack; all AP goes into your main stat. Editing a skill or base stat by hand turns this off.'
                : 'Off: skills and base stats are exactly what you typed.'}
            </span>
          </span>
        </label>

        {levelExp > 0 && (
          <p className="small muted" style={{ marginTop: 6 }}>
            {fmt(expRemaining(c.level, c.currentExp ?? 0))} EXP to Lv {c.level + 1} ({fmt(((c.currentExp ?? 0) / levelExp) * 100)}%).
            EXP per level: <a href={EXP_TABLE_SOURCE.source_url} target="_blank" rel="noreferrer">community table</a> <StatusPill status="community_reported" />
          </p>
        )}

        <div className="row" style={{ marginTop: 16 }}>
          <h3 style={{ margin: 0 }}>Stats</h3>
          <span className="spacer" />
          {!atDefault && (
            <button className="btn small" onClick={() => manual({ base: expectedBase(c.job, c.level) })} title="Starting stats plus every AP in your main stat">
              Reset base to typical Lv {c.level}
            </button>
          )}
        </div>
        <div className="table-wrap" style={{ marginTop: 6 }}>
          <table className="stat-table">
            <thead>
              <tr>
                <th></th>
                {STATS.map((s) => <th key={s}>{s.toUpperCase()}{s === job.primaryStat ? ' ★' : ''}</th>)}
              </tr>
            </thead>
            <tbody>
              {(['base', 'equip'] as const).map((row) => (
                <tr key={row}>
                  <td className="small muted">{row === 'base' ? 'Base (AP)' : 'Equipment bonus'}</td>
                  {STATS.map((s) => (
                    <td key={s}>
                      <NumField label="" value={c[row][s]} min={0} onChange={(v) => (row === 'base' ? manual : update)({ [row]: { ...c[row], [s]: Math.max(0, Math.round(v)) } })} />
                    </td>
                  ))}
                </tr>
              ))}
              <tr>
                <td className="small muted">Total</td>
                {STATS.map((s) => <td key={s}><strong>{c.base[s] + c.equip[s]}</strong></td>)}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 6 }}>
          {ap > 0 && <>Expected unspent AP: <strong>{ap}</strong>. </>}
          {ap < 0 && <span style={{ color: 'var(--warn)' }}>Base stats are {-ap} higher than expected for Lv {c.level}. Check that equipment bonuses are not counted as base. </span>}
          Base stats default to starting stats ({STATS.map((s) => startingStats(c.job)[s]).join('/')} STR/DEX/INT/LUK) plus every AP in {job.primaryStat.toUpperCase()}, and follow your level until you edit them.
          Starting stats 12/5/4/4 (total 25) and {RULES.apPerLevel.value} AP/level <StatusPill status="community_reported" />.
        </p>

        <h3 style={{ marginTop: 16 }}>Weapon &amp; attack</h3>
        <div className="fields">
          <label className="field" style={{ gridColumn: 'span 2' }}>
            Weapon
            <input type="text" value={c.weapon} placeholder="e.g. Wooden Wand" onChange={(e) => update({ weapon: e.target.value })} />
          </label>
          <NumField label="Weapon ATT (all gear)" value={c.weaponAttack} min={0} onChange={(v) => update({ weaponAttack: v })} />
          <NumField label="Magic ATT (all gear)" value={c.magicAttack} min={0} onChange={(v) => update({ magicAttack: v })} />
          {job.family === 'Thief' && (
            <>
              <label className="field" style={{ gridColumn: 'span 2' }}>
                Throwing stars
                <input type="text" value={c.throwingStar} placeholder="e.g. Subi Throwing-Stars" onChange={(e) => update({ throwingStar: e.target.value })} />
              </label>
              <NumField label="Star ATT" value={c.starAttack} min={0} onChange={(v) => update({ starAttack: v })} />
            </>
          )}
          <label className="field" style={{ gridColumn: 'span 2' }}>
            Main attack skill
            <select value={c.mainSkillId ?? ''} onChange={(e) => update({ mainSkillId: e.target.value ? Number(e.target.value) : null, buildId: undefined })}>
              <option value="">(auto: highest-level attack)</option>
              {attacks.map((a) => <option key={a.skill.id} value={a.skill.id}>{a.skill.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      <SkillEditor c={c} update={update} />
      <Observations c={c} update={update} />
    </div>
  );
}

function SkillEditor({ c, update }: { c: Character; update: (p: Partial<Character>) => void }) {
  const job = JOBS[c.job];
  const skills = skillsForJob(c.job);
  const issues = useMemo(() => (job.tier > 0 ? validateAllocation(skillsForJob(c.job, true), c.skills, c.level, job.tier) : []), [c.job, c.skills, c.level, job.tier]);
  const pools = spPools(c.level, job.tier);
  const spent = spentByTier(c.skills);
  if (job.tier === 0) return null;
  const tiers = [...new Set(skills.map((s) => jobTierOfGameJob(s.jobId)))].sort();
  return (
    <div className="card">
      <div className="card-head">
        <h2>Skills</h2>
        <span className="small muted">
          1st job {spent.first}/{pools.first} SP{job.tier === 2 && <> · 2nd job {spent.second}/{pools.second} SP</>}
        </span>
      </div>
      {issues.length > 0 && (
        <div className="callout bad" style={{ marginBottom: 10 }}>
          {issues.map((i, k) => <div key={k}>{i.message}</div>)}
        </div>
      )}
      {tiers.map((t) => (
        <div key={t} style={{ marginBottom: 12 }}>
          <div className="row" style={{ marginBottom: 6 }}>
            <h3 style={{ margin: 0 }}>{t === 1 ? '1st job' : '2nd job'}</h3>
            <span className="spacer" />
            <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              Build
              <select
                value={buildsFor(c.job, t as 1 | 2).some((b) => b.id === c.buildId) ? c.buildId : ''}
                onChange={(e) => update({ buildId: e.target.value || undefined })}
              >
                <option value="">(match main attack)</option>
                {buildsFor(c.job, t as 1 | 2).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          </div>
          <div className="fields" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {skills
              .filter((s) => jobTierOfGameJob(s.jobId) === t)
              .map((s) => (
                <NumField
                  key={s.id}
                  label={<span title={s.description}>{s.name} <span className="muted">/ {s.masterLevel}</span></span>}
                  value={c.skills[s.id] ?? 0}
                  min={0}
                  max={s.masterLevel}
                  onChange={(v) => update({ skills: { ...c.skills, [s.id]: Math.max(0, Math.round(v)) }, followPlan: false })}
                />
              ))}
          </div>
        </div>
      ))}
      <p className="small muted">Skill caps and prerequisites come from the Classic World game files <StatusPill status="verified" />.</p>
    </div>
  );
}

function Observations({ c, update }: { c: Character; update: (p: Partial<Character>) => void }) {
  const attacks = attackSkillsForJob(c.job);
  const blank = (): DamageObservation => ({
    id: newObservationId(), skillId: c.mainSkillId ?? attacks[0]?.skill.id ?? null, mobId: null, min: 0, avg: 0, max: 0, hitRate: 1, note: '', recordedAt: new Date().toISOString(),
  });
  const [draft, setDraft] = useState<DamageObservation>(blank);
  const set = (p: Partial<DamageObservation>) => setDraft((d) => ({ ...d, ...p }));
  const valid = draft.max > 0 && draft.min <= draft.max;

  return (
    <div className="card">
      <div className="card-head">
        <h2>Measured damage</h2>
        <span className="pill measured">Your data</span>
      </div>
      <p className="small muted">
        Enter the damage numbers you see <strong>per line</strong> (Magic Claw shows 2 numbers per cast, Lucky Seven 2 stars). Record which monster you hit: its defense affects the numbers.
        Measurements on a monster are used as-is for that monster and projected to others.
      </p>
      <div className="fields" style={{ alignItems: 'end' }}>
        <label className="field">
          Skill
          <select value={draft.skillId ?? ''} onChange={(e) => set({ skillId: e.target.value ? Number(e.target.value) : null })}>
            {attacks.map((a) => <option key={a.skill.id} value={a.skill.id}>{a.skill.name}</option>)}
          </select>
        </label>
        <label className="field">
          Monster
          <select value={draft.mobId ?? ''} onChange={(e) => set({ mobId: e.target.value ? Number(e.target.value) : null })}>
            <option value="">(unknown / 0 DEF)</option>
            {MONSTERS.filter((m) => !m.isBoss && m.spawns.length).map((m) => <option key={m.id} value={m.id}>{m.name} (Lv {m.level})</option>)}
          </select>
        </label>
        <NumField label="Min" value={draft.min} min={0} onChange={(v) => set({ min: v })} />
        <NumField label="Average" value={draft.avg} min={0} onChange={(v) => set({ avg: v })} title="Leave 0 to use the midpoint of min and max." />
        <NumField label="Max" value={draft.max} min={0} onChange={(v) => set({ max: v })} />
        <NumField label="Hit rate %" value={Math.round(draft.hitRate * 100)} min={0} max={100} onChange={(v) => set({ hitRate: Math.max(0, Math.min(100, v)) / 100 })} />
        <label className="field" style={{ gridColumn: 'span 2' }}>
          Note
          <input type="text" value={draft.note} placeholder="e.g. with Meditation, 20 casts sampled" onChange={(e) => set({ note: e.target.value })} />
        </label>
        <button
          className="btn primary"
          disabled={!valid}
          onClick={() => {
            const o = { ...draft, avg: draft.avg || (draft.min + draft.max) / 2, recordedAt: new Date().toISOString() };
            update({ observations: [o, ...c.observations] });
            setDraft({ ...blank(), skillId: draft.skillId, mobId: draft.mobId });
          }}
        >
          Add
        </button>
      </div>
      {c.observations.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr><th>Skill</th><th>Monster</th><th className="num">Min</th><th className="num">Avg</th><th className="num">Max</th><th className="num">Hit</th><th>Note</th><th>Recorded</th><th></th></tr>
            </thead>
            <tbody>
              {c.observations.map((o) => (
                <tr key={o.id}>
                  <td>{attacks.find((a) => a.skill.id === o.skillId)?.skill.name ?? o.skillId}</td>
                  <td>{o.mobId != null ? monsterById.get(o.mobId)?.name : <span className="muted">unknown</span>}</td>
                  <td className="num">{fmt(o.min)}</td>
                  <td className="num">{fmt(o.avg)}</td>
                  <td className="num">{fmt(o.max)}</td>
                  <td className="num">{fmt(o.hitRate * 100)}%</td>
                  <td className="small">{o.note}</td>
                  <td className="small muted">{o.recordedAt.slice(0, 10)}</td>
                  <td><button className="btn small ghost danger" onClick={() => update({ observations: c.observations.filter((x) => x.id !== o.id) })}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ShareButton({ c }: { c: Character }) {
  const [msg, setMsg] = useState('');
  const send = async () => {
    const url = `${location.origin}${location.pathname}#/characters?share=${encodeCharacter(c)}`;
    const title = `${c.name} (Classic Companion)`;
    try {
      // Phone/PC share sheet: email, text, notes, AirDrop... whatever the device offers.
      if (navigator.share) {
        await navigator.share({ title, text: `Open on your other device to copy ${c.name} there:`, url });
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setMsg('Link copied. Paste it into an email or message to yourself.');
    } catch {
      prompt('Copy this link and open it on your other device:', url);
    }
    setTimeout(() => setMsg(''), 6000);
  };
  return (
    <>
      {msg && <span className="small muted">{msg}</span>}
      <button className="btn small" onClick={send} title="Makes a link that copies this character onto another device. Nothing is uploaded.">
        Send to another device
      </button>
    </>
  );
}
