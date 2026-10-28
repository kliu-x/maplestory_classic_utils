import { DATA_META, MONSTERS } from '../data';
import { SOURCES } from '../data/sources';
import { RULES } from '../data/rules';
import { SourceBadge, StatusPill } from '../components/ui';
import type { PageProps } from './shared';

export default function Sources(_: PageProps) {
  const noSpawn = MONSTERS.filter((m) => !m.spawns.length && !m.isBoss).length;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sources &amp; data integrity</h1>
          <p>What every number in the app is based on, how sure it is, and how to refresh it.</p>
        </div>
      </div>

      <div className="card">
        <h2>Labels</h2>
        <div className="grid grid-2 small">
          <div><StatusPill full status="verified" /> Official Nexon notes, or numbers read from the Classic World game files (via maplestory.io, region MCW).</div>
          <div><StatusPill full status="community_reported" /> A Classic World community guide. Plausible, not confirmed.</div>
          <div><StatusPill full status="unverified" /> An app default or proposal with no Classic World source. Edit it.</div>
          <div><StatusPill full status="conflicting" /> Sources disagree; the app shows both and lets you choose.</div>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}>Damage numbers are labelled separately: Measured (yours) → Projected (yours, rescaled) → Estimate (formula).</p>
      </div>

      <div className="card">
        <h2>Game dataset</h2>
        <p className="small">
          {DATA_META.counts.monsters} monsters, {DATA_META.counts.maps} maps, {DATA_META.counts.skills} skills, {DATA_META.counts.quests} quests from <a href={DATA_META.source} target="_blank" rel="noreferrer">{DATA_META.source}</a>, retrieved{' '}
          {DATA_META.retrieved_at.slice(0, 16).replace('T', ' ')} UTC.
        </p>
        <ul className="notes" style={{ fontSize: 13 }}>
          <li>Classic World uses its own IDs and rebalanced stats (e.g. Snail 45 HP / 2 EXP). Pre-Big-Bang databases are <strong>not</strong> used for any number.</li>
          <li>Missing skillbooks (API errors): {DATA_META.missing_skillbooks.join(', ')}: Beginner and Pirate jobs. Pirates are not in the launch class list.</li>
          <li>{noSpawn} non-boss monsters have no spawn points in any map file (event / PQ / unreleased areas such as Forgotten Hollow).</li>
          <li>3rd job is not in the launch build <SourceBadge source={RULES.thirdJobAvailable.source} compact />.</li>
        </ul>
        <h3 style={{ marginTop: 12 }}>Refreshing the data</h3>
        <ol className="notes" style={{ fontSize: 13, color: 'var(--text)' }}>
          <li><code>npm run data:fetch</code>: polite download (1 request at a time, ≥300 ms apart) into <code>data-raw/mcw-1/</code>. Already-downloaded files are skipped; add <code>-- --refresh</code> to re-download.</li>
          <li><code>npm run data:build</code>: rebuilds <code>src/data/generated/*.json</code> with source metadata.</li>
          <li><code>npm test</code>: data spot-checks fail loudly if a patch changed a checked value; review, then update the test.</li>
        </ol>
      </div>

      <div className="card">
        <h2>Known conflicts &amp; open questions</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Topic</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody>
              <tr><td>Element multipliers</td><td><StatusPill full status="conflicting" /></td><td className="small">MeowDB: weak ×1.25, resistant ×0.75, half ×0.5. Legacy convention: weak ×1.5, resist ×0.5. Code meaning (1/2/3) is the legacy convention. Off by default; selectable on Training.</td></tr>
              <tr><td>Damage / defense / accuracy formulas</td><td><StatusPill full status="community_reported" /></td><td className="small">From MeowDB (updated 2026-10-21); not stated as verified for Classic World. Used only when you have no measured damage, and for projecting measurements.</td></tr>
              <tr><td>SP / AP per level</td><td><StatusPill full status="community_reported" /></td><td className="small">3 SP/level, +1 at advancement (inferred from 61 SP at Lv 30), 5 AP/level, starting stats total 25.</td></tr>
              <tr><td>Respawn time, attack speed, potion prices</td><td><StatusPill full status="unverified" /></td><td className="small">App defaults. Measure in game and edit on the Training page.</td></tr>
              <tr><td>Poison Breath damage</td><td><StatusPill full status="unverified" /></td><td className="small">Its own entry has no damage; hidden skill 2101005 (MAD 50–80, 6 targets) is assumed to be its explosion.</td></tr>
              <tr><td>KPQ rush/bonus rules</td><td><StatusPill full status="unverified" /></td><td className="small">No Classic World source found.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Citations</h2>
        <div className="stack">
          {Object.values(SOURCES).filter((s) => s.source_url).map((s) => (
            <div key={s.source_title} className="row" style={{ alignItems: 'flex-start' }}>
              <StatusPill full status={s.verification_status} />
              <div>
                <a href={s.source_url} target="_blank" rel="noreferrer">{s.source_title}</a>
                <div className="small muted">
                  Retrieved {s.retrieved_at}
                  {'game_version_or_date' in s && s.game_version_or_date ? ` · ${s.game_version_or_date}` : ''}
                  {'notes' in s && s.notes ? ` · ${s.notes}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
