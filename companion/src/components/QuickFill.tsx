import { useEffect, useMemo, useRef, useState } from 'react';
import type { Character } from '../models/types';
import { skillById, skillsForJob } from '../data';
import { lookupByName, mergeParsed, parseScreenshotText, readScreenshot, reviewRows, type ParsedScreenshot } from '../integrations/screenshot';

// "Quick fill" for a profile: level/job by name from ClassicRank, or the Character Stat,
// DETAIL and Skill windows read from screenshots on this device. OCR reads one window at a
// time far better than a whole desktop, so several snips are merged into one review, and a
// full screenshot opens a picker where you box each window. Nothing is saved until the
// user ticks the rows they want.

const EMPTY: ParsedScreenshot = { base: {}, equip: {}, skills: {} };
/** Wider than this, an image is a whole screen and goes to the window picker. */
const FULL_SCREEN_WIDTH = 1100;

export interface Picker {
  url: string;
  bmp: ImageBitmap;
  boxes: { x: number; y: number; w: number; h: number }[];
}

export function QuickFill({ c, save }: { c: Character; save: (c: Character) => void }) {
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [acc, setAcc] = useState<ParsedScreenshot | null>(null);
  const [snips, setSnips] = useState(0);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [rawText, setRawText] = useState<string[]>([]);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [showExample, setShowExample] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => (acc ? reviewRows(c, acc, (id) => skillById.get(id)?.name ?? String(id)) : null), [acc, c]);
  const picked = rows?.filter((r) => !unticked.has(r.key)) ?? [];

  const reset = () => {
    setAcc(null);
    setSnips(0);
    setUnticked(new Set());
    setRawText([]);
    if (picker) URL.revokeObjectURL(picker.url);
    setPicker(null);
  };

  const fromName = async () => {
    setBusy(true);
    setStatus('Looking up on ClassicRank…');
    try {
      const hit = await lookupByName(c.name);
      if (!hit) return setStatus(`${c.name} is not on ClassicRank (new, low-level or hidden characters are missing). Try a screenshot instead.`);
      const next = mergeParsed(acc ?? EMPTY, { ...EMPTY, level: hit.level, job: hit.job });
      setAcc(next);
      setStatus(reviewRows(c, next, String).length ? `ClassicRank: ${hit.name}, Lv ${hit.level} ${hit.jobLabel}.` : `ClassicRank has ${hit.name} at Lv ${hit.level} ${hit.jobLabel}, the same as this profile.`);
    } catch (e) {
      setStatus(`Lookup failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  /** OCR one window (or a small screenshot) and merge it into what has been read so far. */
  const readSnip = async (img: Blob) => {
    setBusy(true);
    setStatus('Reading on this device…');
    try {
      const text = await readScreenshot(img, (p, s) => setStatus(s.includes('recogniz') ? `Reading text… ${Math.round(p * 100)}%` : 'Loading the text reader (first time only)…'));
      setRawText((t) => [...t, text]);
      // Skills of the job on the screenshot (or this profile's), 1st and 2nd job.
      const job = parseScreenshotText(text, []).job ?? acc?.job ?? c.job;
      const next = mergeParsed(acc ?? EMPTY, parseScreenshotText(text, skillsForJob(job)));
      setAcc(next);
      setSnips((n) => n + 1);
      setStatus(reviewRows(c, next, String).length ? '' : 'Nothing new found in that one. Check it shows a whole window clearly (see the example).');
    } catch (e) {
      setStatus(`Could not read the image: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const fromImage = async (img: Blob) => {
    const bmp = await createImageBitmap(img);
    if (bmp.width > FULL_SCREEN_WIDTH) {
      if (picker) URL.revokeObjectURL(picker.url);
      setPicker({ url: URL.createObjectURL(img), bmp, boxes: [] });
      setStatus('');
      return;
    }
    await readSnip(img);
  };

  const cropAndRead = async (r: Picker['boxes'][number]) => {
    if (!picker) return;
    const cv = document.createElement('canvas');
    cv.width = r.w;
    cv.height = r.h;
    cv.getContext('2d')!.drawImage(picker.bmp, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    setPicker({ ...picker, boxes: [...picker.boxes, r] });
    const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, 'image/png'));
    if (blob) await readSnip(blob);
  };

  // Paste a screenshot or snip (Print Screen, Windows+Shift+S) anywhere on the page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      const blob = item?.getAsFile();
      if (blob && !busy) {
        e.preventDefault();
        box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        void fromImage(blob);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const apply = () => {
    save(picked.reduce((x, r) => r.apply(x), c));
    setStatus(`Saved ${picked.length} field${picked.length === 1 ? '' : 's'}.`);
    reset();
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
        <button className="btn small ghost" onClick={() => setShowExample(!showExample)}>{showExample ? 'Hide example' : 'What should I capture?'}</button>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>Paste (Ctrl+V) or upload a screenshot of your stat and skill windows. Read on this device; you review before saving.</p>
      <div className="row">
        <button className="btn primary" disabled={busy} onClick={() => file.current?.click()}>Upload screenshot</button>
        <button className="btn" disabled={busy} onClick={fromName} title="Public rankings: level and job only">Look up {c.name} by name</button>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void fromImage(f); e.target.value = ''; }} />
      </div>
      {status && <p className="small" style={{ marginBottom: 0 }}>{status}</p>}

      {showExample && <Example />}

      {picker && <WindowPicker picker={picker} busy={busy} onBox={cropAndRead} onDone={() => { URL.revokeObjectURL(picker.url); setPicker(null); }} />}

      {rows && (
        <div style={{ marginTop: 12 }}>
          <p className="small" style={{ marginTop: 0 }}>
            Read {snips} window{snips === 1 ? '' : 's'}. {picker ? 'Box another window, or' : 'Paste another (stat, DETAIL or skill window), or'} save below.
          </p>
          {rows.length > 0 && (
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
                          checked={!unticked.has(r.key)}
                          aria-label={`Use ${r.label}`}
                          onChange={(e) => {
                            const next = new Set(unticked);
                            if (e.target.checked) next.delete(r.key);
                            else next.add(r.key);
                            setUnticked(next);
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
          )}
          <p className="small muted">Untick anything it misread, then fix it by hand below. Saving skills or base stats turns off "I follow the plan".</p>
          <div className="row">
            <button className="btn primary" disabled={!picked.length} onClick={apply}>Save {picked.length} field{picked.length === 1 ? '' : 's'}</button>
            <button className="btn" onClick={() => { reset(); setStatus(''); }}>Cancel</button>
            {rawText.length > 0 && (
              <details className="small muted">
                <summary>Text it read</summary>
                <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>{rawText.join('\n----\n')}</pre>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Shows a full screenshot; drag a box around a game window to read just that window. */
export function WindowPicker({ picker, busy, onBox, onDone, prompt }: { picker: Picker; busy: boolean; onBox: (r: Picker['boxes'][number]) => void; onDone: () => void; prompt?: React.ReactNode }) {
  const img = useRef<HTMLImageElement>(null);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const scale = () => (img.current ? picker.bmp.width / img.current.clientWidth : 1);
  const at = (e: React.PointerEvent) => {
    const r = img.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(r.width, e.clientX - r.left)), y: Math.max(0, Math.min(r.height, e.clientY - r.top)) };
  };
  const rect = (d: NonNullable<typeof drag>) => ({ left: Math.min(d.x0, d.x1), top: Math.min(d.y0, d.y1), width: Math.abs(d.x1 - d.x0), height: Math.abs(d.y1 - d.y0) });

  return (
    <div className="shot-overlay">
      <div className="row shot-overlay-bar">
        <span className="small">
          {prompt ?? <><strong>Drag a box around each window</strong>: Character Stat, its DETAIL panel, Skill. Each box is read on its own.</>}
          {busy ? ' Reading…' : picker.boxes.length ? ` ${picker.boxes.length} read.` : ''}
        </span>
        <span className="spacer" />
        <button className="btn small primary" onClick={onDone}>{picker.boxes.length ? 'Done' : 'Cancel'}</button>
      </div>
      <div className="shot-picker">
        <img
          ref={img}
          src={picker.url}
          alt="Your screenshot"
          draggable={false}
          onPointerDown={(e) => {
            if (busy) return;
            (e.target as Element).setPointerCapture(e.pointerId);
            const p = at(e);
            setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
          }}
          onPointerMove={(e) => drag && setDrag({ ...drag, x1: at(e).x, y1: at(e).y })}
          onPointerUp={() => {
            if (!drag) return;
            const r = rect(drag);
            setDrag(null);
            const s = scale();
            if (r.width * s > 40 && r.height * s > 20) onBox({ x: Math.round(r.left * s), y: Math.round(r.top * s), w: Math.round(r.width * s), h: Math.round(r.height * s) });
          }}
        />
        {picker.boxes.map((b, i) => {
          const s = scale();
          return <div key={i} className="shot-box done" style={{ left: b.x / s, top: b.y / s, width: b.w / s, height: b.h / s }} />;
        })}
        {drag && <div className="shot-box" style={rect(drag)} />}
      </div>
    </div>
  );
}

/** A schematic of what to capture: which windows to open and what must be visible. */
function Example() {
  const stat = [['NAME', 'Kayloo'], ['JOB', 'MAGICIAN'], ['LEVEL', '26'], ['HP', '611/611'], ['MP', '1000/1000'], ['EXP.', '11152 (20%)'], ['STR', '4'], ['DEX', '4'], ['INT', '134 (127+7)'], ['LUK', '16 (15+1)']];
  const detail = [['ATTACK', '20 - 26'], ['WEAPON DEF.', '89'], ['MAGIC', '115'], ['MAGIC DEF.', '120']];
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
        <div className="shot-title">DETAIL <span className="muted">(button on the stat window)</span></div>
        {detail.map(([k, v]) => (
          <div key={k} className="shot-line"><span className="shot-label b">{k}</span><span>{v}</span></div>
        ))}
        <div className="small muted" style={{ marginTop: 4 }}>MAGIC = INT/2 + your gear's Magic ATT, so the app works out your Magic ATT.</div>
      </div>
      <div className="shot-win">
        <div className="shot-title">SKILL INVENTORY <span className="muted">(press K)</span></div>
        {skills.map(([k, v]) => (
          <div key={k} className="shot-skill"><span>{k}</span><strong>{v}</strong></div>
        ))}
      </div>
      <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
        <li>Open <strong>Character Stat (S)</strong> with <strong>DETAIL</strong>, and <strong>Skill (K)</strong>.</li>
        <li>Best: <strong>Windows+Shift+S</strong>, snip one window, Ctrl+V here; repeat for each. Or Print Screen once and box the windows.</li>
        <li>Move the mouse off items: a tooltip over a window hides numbers.</li>
        <li>More skills than fit, or a 2nd job tab? Scroll or switch tabs and snip again.</li>
      </ul>
    </div>
  );
}
