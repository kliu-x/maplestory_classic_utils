import { useMemo, useRef, useState } from 'react';
import { NAME_STATUSES, parseNameResults, type NameResults, type NameStatus } from '../integrations/nameChecker';
import { SourceBadge } from '../components/ui';
import { SOURCES } from '../data/sources';
import type { PageProps } from './shared';

const KEY = 'mcw-companion:name-results';

function loadSaved(): NameResults | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? parseNameResults(s) : null;
  } catch {
    return null;
  }
}

export default function NameChecker(_: PageProps) {
  const [data, setData] = useState<NameResults | null>(loadSaved);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<NameStatus | ''>('');
  const [q, setQ] = useState('');
  const file = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const c: Partial<Record<NameStatus, number>> = {};
    for (const r of data?.rows ?? []) c[r.lookup_status] = (c[r.lookup_status] ?? 0) + 1;
    return c;
  }, [data]);
  const rows = (data?.rows ?? []).filter((r) => (!filter || r.lookup_status === filter) && (!q || r.pokemon_name.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pokémon name checker</h1>
          <p>Shows results from the separate Python tool in <code>pokemon_name_checker/</code>. Nothing here is ever labelled "available" from a ranking search.</p>
        </div>
        <div className="row">
          <button className="btn primary" onClick={() => file.current?.click()}>Load results.json</button>
          {data && <button className="btn" onClick={() => { localStorage.removeItem(KEY); setData(null); }}>Clear</button>}
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const text = await f.text();
                const parsed = parseNameResults(text);
                setData(parsed);
                setErr('');
                try { localStorage.setItem(KEY, text); } catch { /* too large / blocked */ }
              } catch (x) {
                setErr((x as Error).message);
              } finally {
                e.target.value = '';
              }
            }}
          />
        </div>
      </div>

      <div className="callout warn" style={{ marginBottom: 16 }}>
        <strong>"Not found in source" ≠ available.</strong> ClassicRank only lists characters its scanner or uploads have seen; hidden, removed and low-level characters are missing. Only a name
        you try at character creation can be confirmed. Record those in <code>data/manual_verifications.csv</code> and re-run the checker. <SourceBadge source={SOURCES.classicRank} compact />
      </div>

      {err && <div className="callout bad" style={{ marginBottom: 16 }}>{err}</div>}

      {!data ? (
        <div className="card">
          <h3>How to run it</h3>
          <ol className="notes" style={{ color: 'var(--text)', fontSize: 13 }}>
            <li><code>cd pokemon_name_checker</code></li>
            <li><code>python check_names.py</code> (all 251 Gen 1–2 names, about 13 requests) or <code>--limit 39</code></li>
            <li>Load <code>output/results.json</code> here.</li>
          </ol>
        </div>
      ) : (
        <>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className={`btn small ${filter === '' ? 'primary' : ''}`} onClick={() => setFilter('')}>All {data.rows.length}</button>
            {(Object.keys(NAME_STATUSES) as NameStatus[]).filter((s) => counts[s]).map((s) => (
              <button key={s} className={`btn small ${filter === s ? 'primary' : ''}`} onClick={() => setFilter(s)}>
                {NAME_STATUSES[s].label}: {counts[s]}
              </button>
            ))}
            <span className="spacer" />
            <input type="search" placeholder="Filter names" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th className="num">#</th><th>Pokémon</th><th>Queried as</th><th>Status</th><th>Character found</th><th>World</th><th>Checked (UTC)</th><th>Notes</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.pokemon_name + r.lookup_name}>
                    <td className="num muted">{r.popularity_rank ?? ''}</td>
                    <td><strong>{r.pokemon_name}</strong> <span className="muted small">Gen {r.generation}</span></td>
                    <td className="small">{r.lookup_name}</td>
                    <td><span className={`pill ${NAME_STATUSES[r.lookup_status].tone}`}>{NAME_STATUSES[r.lookup_status].label}</span></td>
                    <td className="small">{r.matched_character_name ? `${r.matched_character_name} · Lv ${r.matched_level ?? '?'} ${r.matched_job}` : ''}</td>
                    <td className="small">{r.world}</td>
                    <td className="small muted">{r.checked_at_utc}</td>
                    <td className="small muted" style={{ maxWidth: 360 }}>{r.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>File generated {data.generated_at_utc || 'unknown'}.</p>
        </>
      )}
    </>
  );
}
