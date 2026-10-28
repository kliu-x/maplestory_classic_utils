import { useEffect, useMemo, useRef, useState } from 'react';
import type { Character, SavedSession, TrainingAssumptions } from '../models/types';
import { MAPS, mapById, skillById } from '../data';
import { summarize, type Sample, type SessionReport } from '../calculators/session';
import { createBarReader, parseStatusBar, prepareBar } from '../integrations/statusBar';
import { evaluateMapFor } from '../calculators/rank';
import { expRemaining } from '../data/expTable';
import { upsertCharacter } from '../storage/store';
import { fmt, minutes } from './ui';
import { WindowPicker, type Picker } from './QuickFill';

// "Record a session": share the MapleStory window, box the status bar once, and the app
// reads LV / HP / MP / EXP about once a second on this device. Only the numbers are kept.

type Box = Picker['boxes'][number];
const BOX_KEY = 'mcw-companion:statusBarBox';
const EVERY_MS = 1200;
const MIN_REPORT_SECONDS = 5 * 60;

/** Remembered as fractions of the shared frame, so a resized window still lines up. */
function loadBox(): { x: number; y: number; w: number; h: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(BOX_KEY) ?? 'null');
    return v && typeof v.x === 'number' ? v : null;
  } catch {
    return null;
  }
}
function saveBox(b: { x: number; y: number; w: number; h: number }) {
  try {
    localStorage.setItem(BOX_KEY, JSON.stringify(b));
  } catch {
    /* private mode: just box again next time */
  }
}

/** A ticker in a worker: timers on a hidden tab get slowed to once a minute, workers do not. */
function workerTicker(ms: number, tick: () => void): () => void {
  const src = `setInterval(() => postMessage(0), ${ms});`;
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
  const w = new Worker(url);
  w.onmessage = tick;
  return () => {
    w.terminate();
    URL.revokeObjectURL(url);
  };
}

/** One frame of the shared window, straight from the stream (works while this tab is hidden). */
async function grab(track: MediaStreamTrack, video: HTMLVideoElement): Promise<CanvasImageSource> {
  const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { grabFrame(): Promise<ImageBitmap> } }).ImageCapture;
  if (IC) {
    try {
      return await new IC(track).grabFrame();
    } catch {
      /* fall back to the video element */
    }
  }
  return video;
}

export function SessionRecorder({ c, a, skillId, defaultMapId }: { c: Character; a: TrainingAssumptions; skillId: number | null; defaultMapId: number | null }) {
  const [phase, setPhase] = useState<'idle' | 'boxing' | 'recording' | 'done'>('idle');
  const [picker, setPicker] = useState<Picker | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [misses, setMisses] = useState(0);
  const [error, setError] = useState('');
  const [mapId, setMapId] = useState<number | null>(defaultMapId);
  const [saved, setSaved] = useState(false);
  const live = useRef<{ stream: MediaStream; video: HTMLVideoElement; stopTick?: () => void; reader?: Awaited<ReturnType<typeof createBarReader>>; box?: Box; t0: number; busy: boolean } | null>(null);

  const skill = skillId ? skillById.get(skillId) : undefined;
  const mpPerCast = skill ? skill.levels[(c.skills[skill.id] ?? 1) - 1]?.mpCon : undefined;
  const report: SessionReport | null = useMemo(() => (samples.length > 1 ? summarize(samples, { mpPerCast: mpPerCast || undefined }) : null), [samples, mpPerCast]);
  const huntMaps = useMemo(() => MAPS.filter((m) => !m.isTown && m.spawns.length > 0), []);

  useEffect(() => () => stopAll(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function stopAll() {
    const l = live.current;
    if (!l) return;
    l.stopTick?.();
    void l.reader?.close();
    l.stream.getTracks().forEach((t) => t.stop());
    live.current = null;
  }

  async function start() {
    setError('');
    setSaved(false);
    setSamples([]);
    setMisses(0);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
      const video = document.createElement('video');
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      live.current = { stream, video, t0: 0, busy: false };
      stream.getVideoTracks()[0].addEventListener('ended', () => finish());
      const w = video.videoWidth, h = video.videoHeight;
      const remembered = loadBox();
      if (remembered) return begin({ x: remembered.x * w, y: remembered.y * h, w: remembered.w * w, h: remembered.h * h });
      const frame = await grab(stream.getVideoTracks()[0], video);
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      cv.getContext('2d')!.drawImage(frame, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, 'image/png'));
      if (!blob) throw new Error('Could not capture a frame.');
      setPicker({ url: URL.createObjectURL(blob), bmp: await createImageBitmap(blob), boxes: [] });
      setPhase('boxing');
    } catch (e) {
      stopAll();
      const msg = (e as Error).message;
      setError(/denied|NotAllowed/i.test(msg) ? 'Sharing was cancelled.' : `Could not start: ${msg}`);
      setPhase('idle');
    }
  }

  async function begin(box: Box) {
    const l = live.current;
    if (!l) return;
    const w = l.video.videoWidth, h = l.video.videoHeight;
    saveBox({ x: box.x / w, y: box.y / h, w: box.w / w, h: box.h / h });
    if (picker) URL.revokeObjectURL(picker.url);
    setPicker(null);
    setPhase('recording');
    l.box = box;
    l.reader = await createBarReader();
    l.t0 = performance.now();
    const track = l.stream.getVideoTracks()[0];
    let last: Sample | undefined;
    l.stopTick = workerTicker(EVERY_MS, async () => {
      const cur = live.current;
      if (!cur || cur.busy || !cur.reader || !cur.box) return;
      cur.busy = true;
      try {
        const frame = await grab(track, cur.video);
        const text = await cur.reader.read(prepareBar(frame, cur.box));
        const r = parseStatusBar(text, { level: last?.level ?? c.level, mpMax: last?.mpMax ?? (c.mp || undefined) });
        if (r.exp == null) setMisses((n) => n + 1);
        else {
          setMisses(0);
          last = { t: (performance.now() - cur.t0) / 1000, level: r.level, exp: r.exp, mp: r.mp, mpMax: r.mpMax };
          setSamples((s) => [...s, last!]);
        }
      } finally {
        if (live.current) live.current.busy = false;
      }
    });
  }

  function finish() {
    stopAll();
    setPicker(null);
    setPhase((p) => (p === 'recording' ? 'done' : 'idle'));
  }

  function save() {
    if (!report) return;
    const s: SavedSession = {
      id: Math.random().toString(36).slice(2, 10),
      at: new Date().toISOString(),
      mapId,
      level: samples[samples.length - 1]?.level ?? c.level,
      minutes: report.seconds / 60,
      activeMinutes: report.activeSeconds / 60,
      expGained: report.expGained,
      expPerMin: report.expPerMin,
      expPerActiveMin: report.expPerActiveMin,
      kills: report.kills,
      expPerKill: report.expPerKill,
      castsPerKill: report.castsPerKill,
      mpPerMin: report.mpPerMin,
      potions: report.potions,
    };
    const lastSample = samples[samples.length - 1];
    upsertCharacter({ ...c, sessions: [s, ...(c.sessions ?? [])], ...(lastSample?.level ? { level: lastSample.level, currentExp: lastSample.exp } : {}) });
    setSaved(true);
  }

  const map = mapId != null ? mapById.get(mapId) : undefined;
  const estimate = map ? evaluateMapFor(c, skillId, map, a).result.netExpPerMin : null;
  const elapsed = report?.seconds ?? 0;
  const lastS = samples[samples.length - 1];

  return (
    <div className="card">
      <div className="card-head">
        <h2>Record a session</h2>
        {phase === 'recording' ? (
          <button className="btn small danger" onClick={finish}>Stop</button>
        ) : (
          <button className="btn small primary" onClick={start}>{phase === 'done' ? 'Record again' : 'Start'}</button>
        )}
      </div>
      {phase === 'idle' && (
        <p className="small muted" style={{ margin: 0 }}>
          Share your MapleStory window and train as usual; the app reads EXP and MP from the status bar about once a second, on this device (nothing is recorded or
          uploaded). Five minutes is enough for a solid EXP/min. Works in desktop Chrome or Edge.
        </p>
      )}
      {error && <p className="small" style={{ color: 'var(--warn)' }}>{error}</p>}

      {phase === 'boxing' && picker && (
        <WindowPicker
          picker={picker}
          busy={false}
          onBox={(b) => void begin(b)}
          onDone={() => { stopAll(); setPicker(null); setPhase('idle'); }}
          prompt={<><strong>Drag a box around the status bar</strong> at the bottom of the game (LV · HP · MP · EXP). It is remembered for next time.</>}
        />
      )}

      {(phase === 'recording' || phase === 'done') && (
        <>
          <div className="row" style={{ alignItems: 'end', marginBottom: 8 }}>
            <label className="field" style={{ flex: '1 1 220px' }}>
              Map
              <select value={mapId ?? ''} onChange={(e) => setMapId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">(not set)</option>
                {huntMaps.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.street}</option>)}
              </select>
            </label>
            {phase === 'recording' && (
              <span className="small">
                <span className="rec-dot" /> {minutes(elapsed / 60)} · {samples.length} readings
                {lastS?.exp != null && <> · now {fmt(lastS.exp)} EXP{lastS.mp != null ? `, ${fmt(lastS.mp)} MP` : ''}</>}
              </span>
            )}
          </div>
          {misses >= 5 && <p className="callout warn small">Can't read the EXP on the status bar. Is it covered, or the game minimised? <button className="btn small" onClick={() => { try { localStorage.removeItem(BOX_KEY); } catch { /* ignore */ } finish(); }}>Re-box it</button></p>}
          {report && (
            <div className="grid grid-3">
              <Big label="EXP / min (hunting)" value={fmt(report.expPerActiveMin)} sub={`${fmt(report.expPerMin)} counting breaks`} />
              <Big label="Kills / min" value={report.activeSeconds ? fmt((report.kills * 60) / report.activeSeconds, 1) : '—'} sub={`${fmt(report.kills)} kills${report.expPerKill ? ` · ${fmt(report.expPerKill)} EXP each` : ''}`} />
              <Big label="Casts per kill" value={report.castsPerKill != null ? fmt(report.castsPerKill, 2) : '—'} sub={mpPerCast ? `from MP spent (${mpPerCast} MP per ${skill?.name})` : 'set your main attack'} />
              <Big label="MP / min" value={fmt(report.mpPerMin)} sub={`${report.potions} potion${report.potions === 1 ? '' : 's'}`} />
              <Big label="Time to level" value={report.expPerActiveMin > 0 && lastS?.level ? minutes(expRemaining(lastS.level, lastS.exp ?? 0) / report.expPerActiveMin) : '—'} sub="at this rate" />
              <Big label="App estimate here" value={estimate != null ? fmt(estimate) : '—'} sub={estimate == null ? 'pick the map' : report.expPerActiveMin ? `you: ×${fmt(report.expPerActiveMin / estimate, 2)}` : 'EXP/min for this map'} />
            </div>
          )}
          {report && elapsed < MIN_REPORT_SECONDS && <p className="small muted">Keep going: numbers settle after about 5 minutes.</p>}
          {report && report.rejected > 0 && <p className="small muted">{report.rejected} unreadable reading{report.rejected === 1 ? '' : 's'} skipped.</p>}
          {phase === 'done' && report && (
            <div className="row">
              <button className="btn primary" disabled={saved} onClick={save}>{saved ? 'Saved' : 'Save session'}</button>
              <span className="small muted">Also updates {c.name}'s level and EXP.</span>
            </div>
          )}
        </>
      )}

      {(c.sessions?.length ?? 0) > 0 && phase !== 'recording' && (
        <details style={{ marginTop: 10 }}>
          <summary className="small">Past sessions ({c.sessions!.length})</summary>
          <div className="table-wrap" style={{ marginTop: 6 }}>
            <table>
              <thead><tr><th>When</th><th>Map</th><th className="num">Min</th><th className="num">EXP/min</th><th className="num">Kills</th><th className="num">Casts/kill</th></tr></thead>
              <tbody>
                {c.sessions!.map((s) => (
                  <tr key={s.id}>
                    <td className="small">{s.at.slice(0, 16).replace('T', ' ')}</td>
                    <td className="small">{s.mapId != null ? mapById.get(s.mapId)?.name : '—'}</td>
                    <td className="num">{fmt(s.minutes, 1)}</td>
                    <td className="num"><strong>{fmt(s.expPerActiveMin)}</strong></td>
                    <td className="num">{fmt(s.kills)}</td>
                    <td className="num">{s.castsPerKill != null ? fmt(s.castsPerKill, 2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

function Big({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="small muted">{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}
