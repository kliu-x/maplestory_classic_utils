import { useMemo, useState } from 'react';
import type { Character, StatKey } from '../models/types';
import { JOBS } from '../data/rules';
import { skillById } from '../data';
import { formulaEstimate } from '../calculators/attack';
import { rankMaps } from '../calculators/rank';
import { fmt, fmt1, NumField, StatusPill } from '../components/ui';
import { setAssumptions } from '../storage/store';
import { GearByLevel } from '../components/GearByLevel';
import { defaultAttackSkill, NeedCharacter, useActive, type PageProps } from './shared';

const STATS: StatKey[] = ['str', 'dex', 'int', 'luk'];

interface Candidate {
  name: string;
  price: number;
  watk: number;
  matk: number;
  stats: Record<StatKey, number>;
  req: Record<StatKey, number>;
  reqLevel: number;
}

const blank: Candidate = { name: '', price: 0, watk: 0, matk: 0, stats: { str: 0, dex: 0, int: 0, luk: 0 }, req: { str: 0, dex: 0, int: 0, luk: 0 }, reqLevel: 0 };

/** Character wearing the upgrade (deltas vs. the item it replaces). Measured damage is scaled by the formula's ratio. */
function withUpgrade(c: Character, u: Candidate, ratio: number): Character {
  const equip = { ...c.equip };
  for (const s of STATS) equip[s] += u.stats[s];
  return {
    ...c,
    equip,
    weaponAttack: c.weaponAttack + u.watk,
    magicAttack: c.magicAttack + u.matk,
    observations: c.observations.map((o) => ({ ...o, min: o.min * ratio, avg: o.avg * ratio, max: o.max * ratio })),
  };
}

export default function Gear(_: PageProps) {
  const { character: c, assumptions: a } = useActive();
  const [u, setU] = useState<Candidate>(blank);
  const result = useMemo(() => {
    if (!c) return null;
    const sid = defaultAttackSkill(c);
    if (!sid) return null;
    const before = formulaEstimate(c, sid);
    const afterRaw = formulaEstimate(withUpgrade(c, u, 1), sid);
    if (!before || !afterRaw) return null;
    const ratio = before.line.avg > 0 ? afterRaw.line.avg / before.line.avg : 1;
    const topBefore = rankMaps(c, sid, a)[0];
    const topAfter = rankMaps(withUpgrade(c, u, ratio), sid, a)[0];
    const failing = STATS.filter((s) => u.req[s] > c.base[s] + c.equip[s]);
    return { sid, before, after: afterRaw, ratio, topBefore, topAfter, failing, levelOk: c.level >= u.reqLevel };
  }, [c, u, a]);

  if (!c) return <NeedCharacter />;
  const job = JOBS[c.job];
  const set = (p: Partial<Candidate>) => setU((x) => ({ ...x, ...p }));
  const gainPct = result ? (result.ratio - 1) * 100 : 0;
  const expGain = result?.topBefore && result.topAfter ? result.topAfter.result.netExpPerMin - result.topBefore.result.netExpPerMin : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Gear &amp; economy</h1>
          <p>What to wear at each level, and whether an upgrade is worth its price.</p>
        </div>
      </div>
      <GearByLevel c={c} />
      <h2 style={{ marginTop: 20 }}>Is an upgrade worth it?</h2>
      <div className="grid grid-2">
        <div className="card">
          <h3>Candidate upgrade</h3>
          <div className="fields">
            <label className="field" style={{ gridColumn: 'span 2' }}>
              Item
              <input type="text" value={u.name} placeholder="e.g. Metal Wand" onChange={(e) => set({ name: e.target.value })} />
            </label>
            <NumField label="Price (mesos)" value={u.price} min={0} onChange={(v) => set({ price: v })} />
            <NumField label="+ Weapon ATT" value={u.watk} onChange={(v) => set({ watk: v })} />
            <NumField label="+ Magic ATT" value={u.matk} onChange={(v) => set({ matk: v })} />
            {STATS.map((s) => <NumField key={s} label={`+ ${s.toUpperCase()}`} value={u.stats[s]} onChange={(v) => set({ stats: { ...u.stats, [s]: v } })} />)}
          </div>
          <h3 style={{ marginTop: 12 }}>Requirements</h3>
          <div className="fields">
            <NumField label="Level" value={u.reqLevel} min={0} onChange={(v) => set({ reqLevel: v })} />
            {STATS.map((s) => <NumField key={s} label={`${s.toUpperCase()}`} value={u.req[s]} min={0} onChange={(v) => set({ req: { ...u.req, [s]: v } })} />)}
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            Item stats are entered by hand for now; an item database from the Classic World files is planned.
          </p>
        </div>

        <div className="card">
          <h3>Result for {c.name}</h3>
          {!result ? (
            <p className="muted">Pick a main attack skill on the character first.</p>
          ) : (
            <div className="stack">
              {(result.failing.length > 0 || !result.levelOk) && (
                <div className="callout bad">
                  Can't equip yet:{' '}
                  {!result.levelOk && `level ${u.reqLevel} needed. `}
                  {result.failing.map((s) => `${s.toUpperCase()} ${u.req[s]} (you have ${c.base[s] + c.equip[s]})`).join(', ')}
                </div>
              )}
              <div className="detail-grid">
                <div className="kv"><div className="k">Avg damage / line</div><div className="v">{fmt(result.before.line.avg)} → {fmt(result.after.line.avg)}</div></div>
                <div className="kv"><div className="k">Damage change</div><div className="v" style={{ color: gainPct >= 0 ? 'var(--good)' : 'var(--bad)' }}>{gainPct >= 0 ? '+' : ''}{fmt1(gainPct)}%</div></div>
                <div className="kv"><div className="k">Best map EXP/min</div><div className="v">{fmt(result.topBefore?.result.netExpPerMin ?? 0)} → {fmt(result.topAfter?.result.netExpPerMin ?? 0)}</div></div>
                <div className="kv"><div className="k">Mesos per +1% damage</div><div className="v">{gainPct > 0 && u.price > 0 ? fmt(u.price / gainPct) : '—'}</div></div>
                <div className="kv"><div className="k">EXP/min gained</div><div className="v">{expGain >= 0 ? '+' : ''}{fmt(expGain)}</div></div>
              </div>
              <p className="small muted">
                Damage change uses the community formula for {skillById.get(result.sid)?.name} <StatusPill status="community_reported" />. Your measured damage is scaled by the same ratio for the EXP/min
                figure. Spawn-limited maps may show little EXP gain even with more damage.
              </p>
            </div>
          )}
        </div>
      </div>

      {job.family === 'Thief' && <StarEconomics c={c} />}

      <div className="card" style={{ marginTop: 16 }}>
        <h3>Meso income</h3>
        <p className="small muted">
          Meso/hour from drops is not modelled yet: drop tables were not part of the verified dataset. Costs per minute (potions, stars) are on the Training page.
        </p>
      </div>
    </>
  );
}

function StarEconomics({ c }: { c: Character }) {
  const { assumptions: a } = useActive();
  const [stack, setStack] = useState(800);
  const [stackPrice, setStackPrice] = useState(0);
  const sid = defaultAttackSkill(c);
  const top = useMemo(() => (sid ? rankMaps(c, sid, a)[0] : undefined), [c, sid, a]);
  const starsPerHour = (top?.result.starsPerMin ?? 0) * 60;
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <h3>Throwing-star economics</h3>
        <StatusPill status="unverified" title="Stack sizes and prices: enter your own values" />
      </div>
      <div className="fields">
        <NumField label="Stars per stack" value={stack} min={1} onChange={setStack} />
        <NumField label="New stack price" value={stackPrice} min={0} onChange={setStackPrice} />
        <NumField label="Recharge price / star" value={a.starRechargePricePerStar} min={0} step={0.1} onChange={(v) => setAssumptions({ starRechargePricePerStar: v })} />
      </div>
      <div className="detail-grid" style={{ marginTop: 10 }}>
        <div className="kv"><div className="k">Stars / hour ({top?.map.name ?? '—'})</div><div className="v">{fmt(starsPerHour)}</div></div>
        <div className="kv"><div className="k">Stacks / hour</div><div className="v">{fmt1(starsPerHour / stack)}</div></div>
        <div className="kv"><div className="k">Recharge mesos / hour</div><div className="v">{fmt(starsPerHour * a.starRechargePricePerStar)}</div></div>
        <div className="kv"><div className="k">If buying new stacks / hour</div><div className="v">{stackPrice ? fmt((starsPerHour / stack) * stackPrice) : '—'}</div></div>
      </div>
      <p className="small muted" style={{ marginTop: 6 }}>Claw Mastery's star-recovery chance is not subtracted yet.</p>
    </div>
  );
}
