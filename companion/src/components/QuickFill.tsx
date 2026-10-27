import { useEffect, useRef, useState } from 'react';
import type { Character } from '../models/types';
import { skillById, skillsForJob } from '../data';
import { lookupByName, parseScreenshotText, readScreenshot, reviewRows, type ReviewRow } from '../integrations/screenshot';

// "Quick fill" for a profile: level/job by name from ClassicRank, or everything on the
// Character Stat + Skill windows from a screenshot read on this device. Nothing is saved
// until the user ticks the rows they want.

export function QuickFill({ c, save }: { c: Character; save: (c: Character) => void }) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [rawText, setRawText] = useState('');
  const [showExample, setShowExample] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const review = (r: ReviewRow[], none: string) => {
    setRows(r);
    setPicked(new Set(r.map((x) => x.key)));
    setStatus(r.length ? '' : none);
  };

  const fromName = async () => {
    setBusy(true);
    setStatus('Looking up on ClassicRank…');
    try {
      const hit = await lookupByName(c.name);
      if (!hit) return review([], `${c.name} is not on ClassicRank (new, low-level or hidden characters are missing). Try a screenshot instead.`);
      review(
        reviewRows(c, { level: hit.level, job: hit.job, base: {}, equip: {}, skills: {} }, String),
        `ClassicRank has ${hit.name} at Lv ${hit.level} ${hit.jobLabel}, the same as this profile.`,
      );
    } catch (e) {
      setStatus(`Lookup failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const fromImage = async (img: Blob) => {
    setBusy(true);
    setRows(null);
    setStatus('Reading screenshot on this device…');
    try {
      const text = await readScreenshot(img, (p, s) => setStatus(s.includes('recogniz') ? `Reading text… ${Math.round(p * 100)}%` : 'Loading the text reader (first time only)…'));
      setRawText(text);
      const job = (() => {
        const p = parseScreenshotText(text, []);
        return p.job ?? c.job;
      })();
      // Skills of the job on the screenshot (or this profile's), 1st and 2nd job.
      const skills = skillsForJob(job);
      const parsed = parseScreenshotText(text, skills);
      review(reviewRows(c, parsed, (id) => skillById.get(id)?.name ?? String(id)), 'Nothing new found. Check the screenshot shows the Character Stat and Skill windows clearly (see the example).');
    } catch (e) {
      setStatus(`Could not read the image: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  // Paste a screenshot (Ctrl+V / Print Screen) anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      const blob = item?.getAsFile();
      if (blob && !busy) {
        e.preventDefault();
        box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        void fromImage(blob);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const apply = () => {
    if (!rows) return;
    save(rows.filter((r) => picked.has(r.key)).reduce((x, r) => r.apply(x), c));
    setStatus(`Saved ${picked.size} field${picked.size === 1 ? '' : 's'}.`);
    setRows(null);
  };

  return (
    <div
      className="card"
      ref={box}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
        if (f) void fromImage(f);
      }}
    >
      <div className="card-head">
        <h2>Quick fill</h2>
        <button className="btn small ghost" onClick={() => setShowExample(!showExample)}>{showExample ? 'Hide example' : 'What should the screenshot show?'}</button>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        Upload, drop or paste (Ctrl+V) a screenshot and the app reads your level, EXP, HP/MP, stats and skills. It reads the image <strong>on this device</strong>; nothing is uploaded.
        You check every value before it is saved.
      </p>
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={() => file.current?.click()}>Upload screenshot</button>
        <button className="btn" disabled={busy} onClick={fromName} title="Public rankings: level and job only">Look up {c.name} by name</button>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void fromImage(f); e.target.value = ''; }} />
      </div>
      {status && <p className="small" style={{ marginBottom: 0 }}>{status}</p>}

      {showExample && <Example />}

      {rows && rows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th></th><th>Field</th><th className="num">Now</th><th className="num">From screenshot</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <input
                        type="checkbox"
                        checked={picked.has(r.key)}
                        aria-label={`Use ${r.label}`}
                        onChange={(e) => {
                          const next = new Set(picked);
                          if (e.target.checked) next.add(r.key);
                          else next.delete(r.key);
                          setPicked(next);
                        }}
                      />
                    </td>
                    <td>{r.label}</td>
                    <td className="num muted">{r.current}</td>
                    <td className="num"><strong>{r.found}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted">Untick anything it misread, then fix it by hand below. Saving skills or base stats turns off "I follow the plan".</p>
          <div className="row">
            <button className="btn primary" disabled={!picked.size} onClick={apply}>Save {picked.size} field{picked.size === 1 ? '' : 's'}</button>
            <button className="btn" onClick={() => { setRows(null); setStatus(''); }}>Cancel</button>
            {rawText && (
              <details className="small muted">
                <summary>Text it read</summary>
                <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>{rawText}</pre>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A schematic of a good screenshot: which windows to open and what must be visible. */
function Example() {
  const job = 'MAGICIAN';
  const stat = [['NAME', 'Kayloo'], ['JOB', job], ['LEVEL', '26'], ['HP', '611/611'], ['MP', '1000/1000'], ['EXP.', '11152 (20%)'], ['STR', '4'], ['DEX', '4'], ['INT', '134 (127+7)'], ['LUK', '16 (15+1)']];
  const skills = [['Energy Bolt', '20'], ['Magic Claw', '0'], ['Magic Guard', '1'], ['Magic Armor', '0'], ['Max MP Increase', '13'], ['Improved MP Reco…', '15']];
  return (
    <div className="shot-example">
      <div className="shot-win">
        <div className="shot-title">CHARACTER STAT <span className="muted">(press S)</span></div>
        {stat.map(([k, v]) => (
          <div key={k} className="shot-line"><span className={`shot-label ${['STR', 'DEX', 'INT', 'LUK'].includes(k) ? 'g' : ''}`}>{k}</span><span>{v}</span></div>
        ))}
      </div>
      <div className="shot-win">
        <div className="shot-title">SKILL INVENTORY <span className="muted">(press K, 1st or 2nd job tab)</span></div>
        {skills.map(([k, v]) => (
          <div key={k} className="shot-skill"><span>{k}</span><strong>{v}</strong></div>
        ))}
      </div>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        <li>Open <strong>Character Stat (S)</strong> and <strong>Skill (K)</strong> side by side, then press Print Screen and paste here.</li>
        <li>Move the mouse off items: a tooltip over the stat window hides numbers.</li>
        <li>Full-size screenshot, not a phone photo of the screen. Crop to the two windows if you like.</li>
        <li>More skills than fit? Scroll the Skill window and add a second screenshot.</li>
        <li>Not in these windows: <strong>Magic ATT / Weapon ATT</strong> (click DETAIL, or hover your weapon). Type it under Weapon &amp; attack.</li>
      </ul>
    </div>
  );
}

