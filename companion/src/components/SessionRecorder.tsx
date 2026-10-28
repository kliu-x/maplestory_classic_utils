import { useEffect, useMemo, useRef, useState } from 'react';
import type { Character, SavedSession, TrainingAssumptions } from '../models/types';
import { MAPS, MONSTERS, mapById, skillById } from '../data';
import { monstersGiving, summarize, type Sample, type SessionReport } from '../calculators/session';
import { createBarReader, locateBar, matchMapName, parseStatusBar, prepareBar, titleRegion } from '../integrations/statusBar';
import { evaluateMapFor } from '../calculators/rank';
import { expRemaining } from '../data/expTable';
import { upsertCharacter } from '../storage/store';
import { fmt, minutes } from './ui';
import { WindowPicker, type Picker } from './QuickFill';
import { MapPicker } from './MapPicker';

// "Record a session": share the MapleStory window, box the status bar once, and the app
// reads LV / HP / MP / EXP about once a second on this device. Only the numbers are kept.

type Box = Picker['boxes'][number];
const BOX_KEY = 'mcw-companion:statusBarBox';
/** The minimap title (map name), top left; 'skip' if the player chose not to box it. */
const NAME_KEY = 'mcw-companion:mapNameBox';
/** Read the map name every this many ticks (about every 15 s). */
const NAME_EVERY = 12;
const EVERY_MS = 1200;
const MIN_REPORT_SECONDS = 5 * 60;
const lastMapKey = (charId: string) => `mcw-companion:lastSessionMap:${charId}`;
function loadLastMap(charId: string): number | null {
  try {
    return Number(localStorage.getItem(lastMapKey(charId))) || null;
  } catch {
    return null;
  }
}

/** Remembered as fractions of the shared frame, so a resized window still lines up. */
function loadBox(): { x: number; y: number; w: number; h: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(BOX_KEY) ?? 'null');
    return v && typeof v.x === 'number' ? v : null;
  } catch {
    return null;
  }
}
function loadNameBox(): { x: number; y: number; w: number; h: number } | 'skip' | null {
  try {
    const v = localStorage.getItem(NAME_KEY);
    return v === 'skip' ? 'skip' : v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
function saveBox(b: { x: number; y: number; w: number; h: number }, name: { x: number; y: number; w: number; h: number } | null) {
  try {
    localStorage.setItem(NAME_KEY, name ? JSON.stringify(name) : 'skip');
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
  const [phase, setPhase] = useState<'idle' | 'finding' | 'boxing' | 'recording' | 'done'>('idle');
  const [picker, setPicker] = useState<Picker | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [misses, setMisses] = useState(0);
  const [error, setError] = useState('');
  const [mapId, setMapId] = useState<number | null>(() => loadLastMap(c.id) ?? defaultMapId);
  // Until the user picks a map, it is guessed from the EXP each kill gives.
  const [mapChosen, setMapChosen] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const live = useRef<{ stream: MediaStream; video: HTMLVideoElement; stopTick?: () => void; reader?: Awaited<ReturnType<typeof createBarReader>>; box?: Box; nameBox?: Box | null; t0: number; busy: boolean; ticks: number; misses: number } | null>(null);
  // Boxing happens in two steps: the status bar, then (optionally) the map name.
  const [barBox, setBarBox] = useState<Box | null>(null);
  const mapChosenRef = useRef(false);
  const [mapFromName, setMapFromName] = useState(false);

  const skill = skillId ? skillById.get(skillId) : undefined;
  const mpPerCast = skill ? skill.levels[Math.max(1, c.skills[skill.id] ?? 1) - 1]?.mpCon : undefined;
  const report: SessionReport | null = useMemo(() => (samples.length > 1 ? summarize(samples, { mpPerCast: mpPerCast || undefined }) : null), [samples, mpPerCast]);
  const guessed = useMemo(() => monstersGiving(MONSTERS, report?.expPerKill ?? null), [report?.expPerKill]);
  useEffect(() => {
    if (mapChosen || mapFromName || guessed.length !== 1) return;
    const top = guessed[0].spawns[0]; // spawns are sorted by spawn points, most first
    if (top && (top as { mapId: number }).mapId !== mapId) setMapId((top as { mapId: number }).mapId);
  }, [guessed, mapChosen]); // eslint-disable-line react-hooks/exhaustive-deps

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
    setSavedId(null);
    setSamples([]);
    setMisses(0);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 5 }, audio: false });
      const video = document.createElement('video');
      video.muted = true;
      video.srcObject = stream;
      await video.play();
      live.current = { stream, video, t0: 0, busy: false, ticks: 0, misses: 0 };
      setBarBox(null);
      setMapFromName(false);
      stream.getVideoTracks()[0].addEventListener('ended', () => finish());
      const w = video.videoWidth, h = video.videoHeight;
      // Find the status bar by itself; the map name is then the top-left corner of the window.
      setPhase('finding');
      const reader = await createBarReader();
      live.current.reader = reader;
      const found = await locateBar(await grab(stream.getVideoTracks()[0], video), w, h, reader, { level: c.level, mpMax: c.mp || undefined });
      if (found) return begin(found, titleRegion(w, h));
      const remembered = loadBox();
      const nameRemembered = loadNameBox();
      const scale = (b: { x: number; y: number; w: number; h: number }) => ({ x: b.x * w, y: b.y * h, w: b.w * w, h: b.h * h });
      if (remembered && nameRemembered) return begin(scale(remembered), nameRemembered === 'skip' ? null : scale(nameRemembered));
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
      setError(/denied|NotAllowed|cancel/i.test(msg) ? 'Not recording: no window was shared. Press Start, choose your MapleStory window and press Share.' : `Could not start: ${msg}`);
      setPhase('idle');
    }
  }

  async function begin(box: Box, nameBox: Box | null) {
    const l = live.current;
    if (!l) return;
    const w = l.video.videoWidth, h = l.video.videoHeight;
    const frac = (b: Box) => ({ x: b.x / w, y: b.y / h, w: b.w / w, h: b.h / h });
    saveBox(frac(box), nameBox ? frac(nameBox) : null);
    l.nameBox = nameBox;
    if (picker) URL.revokeObjectURL(picker.url);
    setPicker(null);
    setPhase('recording');
    l.box = box;
    l.reader ??= await createBarReader();
    l.t0 = performance.now();
    const track = l.stream.getVideoTracks()[0];
    let last: Sample | undefined;
    l.stopTick = workerTicker(EVERY_MS, async () => {
      const cur = live.current;
      if (!cur || cur.busy || !cur.reader || !cur.box) return;
      cur.busy = true;
      try {
        const frame = await grab(track, cur.video);
        // Now and then, read the map name from the minimap title (top left).
        if (cur.nameBox && cur.ticks++ % NAME_EVERY === 0 && !mapChosenRef.current) {
          const m = matchMapName(await cur.reader.read(prepareBar(frame, cur.nameBox, 3)), MAPS);
          if (m) {
            setMapId(m.id);
            setMapFromName(true);
          }
        }
        const hints = { level: last?.level ?? c.level, mpMax: last?.mpMax ?? (c.mp || undefined) };
        let r = parseStatusBar(await cur.reader.read(prepareBar(frame, cur.box)), hints);
        // One bad frame (a damage number or pop-up over the bar) is common: try larger once.
        if (r.exp == null) r = parseStatusBar(await cur.reader.read(prepareBar(frame, cur.box, 3)), hints);
        if (r.exp == null) {
          cur.misses++;
          setMisses(cur.misses);
          // Still nothing after ~10 s: the window was probably resized or moved; find the bar again.
          if (cur.misses % 8 === 0) {
            const vw = cur.video.videoWidth, vh = cur.video.videoHeight;
            const found = await locateBar(frame, vw, vh, cur.reader, hints);
            if (found) {
              cur.box = found;
              cur.nameBox = titleRegion(vw, vh);
              saveBox({ x: found.x / vw, y: found.y / vh, w: found.w / vw, h: found.h / vh }, { x: 0, y: 0, w: 0.4, h: 0.12 });
            }
          }
        } else {
          cur.misses = 0;
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

  // Save as soon as recording stops (if anything was gained); Undo removes it again.
  useEffect(() => {
    if (phase === 'done' && report && report.expGained > 0 && !savedId) save();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  function save() {
    if (!report) return;
    const s: SavedSession = {
      id: Math.random().toString(36).slice(2, 10),
      at: new Date().toISOString(),
      mapId,
      level: report.last?.level ?? c.level,
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
    const lastSample = report.last;
    try {
      if (mapId != null) localStorage.setItem(lastMapKey(c.id), String(mapId));
    } catch {
      /* fine: the next session just guesses again */
    }
    upsertCharacter({ ...c, sessions: [s, ...(c.sessions ?? [])], ...(lastSample?.level && Math.abs(lastSample.level - c.level) <= 1 ? { level: lastSample.level, currentExp: lastSample.exp } : {}) });
    setSavedId(s.id);
  }

  function undo() {
    upsertCharacter({ ...c, sessions: (c.sessions ?? []).filter((s) => s.id !== savedId) });
    setSavedId(null);
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
          <button className="btn small primary" onClick={start} disabled={phase === 'finding'}>{phase === 'done' ? 'Record again' : 'Start'}</button>
        )}
      </div>
      {phase === 'idle' && !error && (
        <p className="small muted" style={{ margin: 0 }}>
          Press Start, pick the MapleStory window, play, then Stop. It saves by itself. Nothing leaves this device.
        </p>
      )}
      {error && <p className="callout warn small">{error}</p>}
      {phase === 'finding' && <p className="small muted" style={{ margin: 0 }}>Looking for the status bar…</p>}

      {phase === 'boxing' && picker && (
        <WindowPicker
          picker={picker}
          busy={false}
          onBox={(b) => {
            if (!barBox) {
              setBarBox(b);
              setPicker({ ...picker, boxes: [b] });
            } else void begin(barBox, b);
          }}
          doneLabel={barBox ? 'Skip' : 'Cancel'}
          onDone={() => {
            if (barBox) return void begin(barBox, null);
            stopAll();
            setPicker(null);
            setPhase('idle');
            setError("Not recording: the status bar wasn't boxed. Press Start again and drag a box around LV · HP · MP · EXP at the bottom of the game.");
          }}
          prompt={
            barBox ? (
              <><strong>Optional: box the map name</strong> at the top left (the minimap title, expanded so the name shows). Then the map is picked for you. Or press Skip.</>
            ) : (
              <><strong>Couldn't find the status bar by itself</strong> (it does when you share just the game window). Drag a box around LV · HP · MP · EXP at the bottom of the game; it's remembered next time.</>
            )
          }
        />
      )}

      {(phase === 'recording' || phase === 'done') && (
        <>
          <div className="row" style={{ alignItems: 'end', marginBottom: 8 }}>
            <div style={{ flex: '1 1 300px' }}>
              <MapPicker
                value={mapId}
                onChange={(id) => {
                  setMapId(id);
                  setMapChosen(true);
                  mapChosenRef.current = true;
                }}
                suggest={[...guessed.flatMap((m) => m.spawns.slice(0, 2).map((s) => (s as { mapId: number }).mapId)), loadLastMap(c.id), ...(c.sessions ?? []).map((s) => s.mapId), defaultMapId]}
                note={
                  mapChosen ? undefined : mapFromName ? "read from the game's minimap" : guessed.length === 1 && report?.expPerKill ? `guessed from ${report.expPerKill} EXP per kill (${guessed[0].name})` : undefined
                }
              />
            </div>
            {phase === 'recording' && (
              <span className="small">
                <span className="rec-dot" /> {minutes(elapsed / 60)} · {samples.length} readings
                {lastS?.exp != null && <> · now {fmt(lastS.exp)} EXP{lastS.mp != null ? `, ${fmt(lastS.mp)} MP` : ''}</>}
              </span>
            )}
          </div>
          {misses >= 25 && (
            <p className="callout warn small">
              No EXP read for {Math.round((misses * EVERY_MS) / 1000)} s. Is the game minimised, or something covering the bottom bar? It keeps trying by itself.{' '}
              <button className="btn small ghost" onClick={() => { try { localStorage.removeItem(BOX_KEY); localStorage.removeItem(NAME_KEY); } catch { /* ignore */ } finish(); }}>Stop and box it myself</button>
            </p>
          )}
          {report && (
            <div className="grid grid-3">
              <Big label="EXP / min (hunting)" value={fmt(report.expPerActiveMin)} sub={`${fmt(report.expPerMin)} counting breaks`} />
              <Big label="Kills / min" value={report.activeSeconds ? fmt((report.kills * 60) / report.activeSeconds, 1) : '—'} sub={`${fmt(report.kills)} kills${report.expPerKill ? ` · ${fmt(report.expPerKill)} EXP each` : ''}`} />
              <Big label="Casts per kill" value={report.castsPerKill != null ? fmt(report.castsPerKill, 2) : '—'} sub={mpPerCast ? `from MP spent (${mpPerCast} MP per ${skill?.name})` : 'set your main attack'} />
              <Big label="MP / min" value={fmt(report.mpPerMin)} sub={`${report.potions} potion${report.potions === 1 ? '' : 's'}`} />
              <Big label="Time to level" value={report.expPerActiveMin > 0 && report.last?.level ? minutes(expRemaining(report.last.level, report.last.exp ?? 0) / report.expPerActiveMin) : '—'} sub="at this rate" />
              <Big label="App estimate here" value={estimate != null ? fmt(estimate) : '—'} sub={estimate == null ? 'pick the map' : report.expPerActiveMin ? `you: ×${fmt(report.expPerActiveMin / estimate, 2)}` : 'EXP/min for this map'} />
            </div>
          )}
          {report && elapsed < MIN_REPORT_SECONDS && <p className="small muted">Keep going: numbers settle after about 5 minutes.</p>}
          {report && report.rejected > 0 && <p className="small muted">{report.rejected} unreadable reading{report.rejected === 1 ? '' : 's'} skipped.</p>}
          {phase === 'done' && report && (
            <div className="row">
              {savedId ? (
                <>
                  <span className="small">Saved to Your sessions, and {c.name}'s level and EXP updated.</span>
                  <button className="btn small ghost" onClick={undo}>Undo</button>
                </>
              ) : (
                <>
                  <span className="small muted">No EXP gained, so nothing was saved.</span>
                  {report.readings > 1 && <button className="btn small ghost" onClick={save}>Save anyway</button>}
                </>
              )}
            </div>
          )}
        </>
      )}

    </div>
  );
}

/** Saved sessions for this character, newest first, as their own section. */
export function PastSessions({ c }: { c: Character }) {
  const list = c.sessions ?? [];
  if (!list.length) return null;
  const best = list.reduce((b, s) => (s.expPerActiveMin > b.expPerActiveMin ? s : b)).id;
  const remove = (id: string) => {
    if (confirm('Delete this session?')) upsertCharacter({ ...c, sessions: list.filter((s) => s.id !== id) });
  };
  const setMap = (id: string, mapId: number | null) => upsertCharacter({ ...c, sessions: list.map((s) => (s.id === id ? { ...s, mapId } : s)) });
  return (
    <div className="card">
      <div className="card-head">
        <h2>Your sessions</h2>
        <span className="small muted">{list.length} saved, newest first</span>
      </div>
      <ul className="session-list">
        {[...list].reverse().map((s) => {
          const facts = [
            s.activeMinutes ? `${fmt(s.kills / s.activeMinutes, 1)} kills/min` : null,
            s.expPerKill ? `${fmt(s.expPerKill)} EXP/kill` : null,
            s.castsPerKill != null ? `${fmt(s.castsPerKill, 2)} casts/kill` : null,
            `${fmt(s.mpPerMin)} MP/min`,
            s.potions ? `${s.potions} potions` : null,
          ].filter(Boolean);
          return (
            <li key={s.id} className="session-item">
              <div className="session-main">
                <div>
                  {s.id === best && list.length > 1 && <span className="pill verified" style={{ float: 'right' }}>Best</span>}
                  <MapPicker
                    value={s.mapId}
                    onChange={(id) => setMap(s.id, id)}
                    suggest={[...monstersGiving(MONSTERS, s.expPerKill).flatMap((m) => m.spawns.slice(0, 2).map((x) => (x as { mapId: number }).mapId)), ...list.map((x) => x.mapId)]}
                  />
                </div>
                <div className="small muted">
                  Lv {s.level} · {new Date(s.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {fmt(s.activeMinutes, 1)} of {fmt(s.minutes, 1)} min hunting
                </div>
                <div className="small session-facts">{facts.join(' · ')}</div>
              </div>
              <div className="session-rate">
                <div className="value">{fmt(s.expPerActiveMin)}</div>
                <div className="small muted">EXP/min</div>
              </div>
              <button className="btn small ghost danger" onClick={() => remove(s.id)} aria-label="Delete session">✕</button>
            </li>
          );
        })}
      </ul>
      
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
