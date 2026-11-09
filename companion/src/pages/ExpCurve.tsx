import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { PageProps } from './shared';
import { useActive } from './shared';
import { EXP_TABLE_SOURCE } from '../data/expTable';
import { expCurve, MAX_LEVEL, shareOfJourney, type CurvePoint } from '../calculators/expCurve';
import { fmt, Stat, StatusPill } from '../components/ui';

// How much EXP each level takes, and how it piles up. Two charts (per level and running total) share one
// selected level: the slider, a click on either chart, or the URL (?lv=) sets it; hovering previews a level.

type Scale = 'log' | 'linear';
type Kind = 'marginal' | 'cumulative' | 'increase';
const LATE = 90;

const KINDS: Record<Kind, { label: string; value: (p: CurvePoint) => number | null; tip: (p: CurvePoint) => string }> = {
  marginal: { label: 'EXP needed for each level', value: (p) => p.marginal || null, tip: (p) => `${fmt(p.marginal)} EXP to Lv ${p.level + 1}` },
  cumulative: { label: 'Total EXP to reach each level', value: (p) => p.cumulative || null, tip: (p) => `${fmt(p.cumulative)} EXP total` },
  increase: { label: 'Increase in EXP needed over the level before', value: (p) => p.increase, tip: (p) => `+${fmt(p.increase ?? 0)} EXP vs Lv ${p.level - 1}` },
};
const CURVE = expCurve();

/** Short EXP numbers for axes: 950, 12k, 3.4M, 9.5B. */
function short(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${+(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${+(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${+(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return String(Math.round(n));
}

function niceTicks(max: number, count = 5): number[] {
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) out.push(v);
  return out;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(700);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

interface ChartProps {
  kind: Kind;
  scale: Scale;
  selected: number;
  mine: { level: number; name: string } | null;
  hover: number | null;
  onHover: (l: number | null) => void;
  onPick: (l: number) => void;
}

const H = 240;
const PAD = { l: 52, r: 14, t: 14, b: 28 };

function CurveChart({ kind, scale, selected, mine, hover, onHover, onPick }: ChartProps) {
  const [box, W] = useWidth<HTMLDivElement>();
  const pts = CURVE.filter((p) => (KINDS[kind].value(p) ?? 0) > 0);
  const val = (p: CurvePoint) => KINDS[kind].value(p) ?? 0;
  const max = Math.max(...pts.map(val));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const lvMin = 1;
  const lvMax = MAX_LEVEL;
  const x = (lv: number) => PAD.l + ((lv - lvMin) / (lvMax - lvMin)) * iw;
  const logMin = 1; // 10^1
  const logMax = Math.ceil(Math.log10(max));
  const y = (v: number) =>
    scale === 'log'
      ? PAD.t + ih - ((Math.log10(Math.max(v, 10 ** logMin)) - logMin) / (logMax - logMin)) * ih
      : PAD.t + ih - (v / max) * ih;
  const ticks = scale === 'log' ? Array.from({ length: logMax - logMin + 1 }, (_, i) => 10 ** (logMin + i)).filter((_, i, a) => a.length <= 6 || i % 2 === 0) : niceTicks(max);
  const levelAt = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    const lv = Math.round(lvMin + ((px - PAD.l) / iw) * (lvMax - lvMin));
    const valid = pts.map((p) => p.level);
    return Math.min(Math.max(lv, valid[0]), valid[valid.length - 1]);
  };
  const move = (e: ReactPointerEvent<SVGSVGElement>) => onHover(levelAt(e.clientX, e.currentTarget.getBoundingClientRect()));
  const focus = hover ?? selected;
  const fp = pts.find((p) => p.level === focus);
  const toPath = (ps: CurvePoint[]) => ps.map((p, i) => `${i ? 'L' : 'M'}${x(p.level).toFixed(1)},${y(val(p)).toFixed(1)}`).join('');
  // Solid up to Lv 90; the unconfirmed 90+ stretch is dashed.
  const line = toPath(pts.filter((p) => p.level <= LATE));
  const lateDots = pts.filter((p) => p.level >= LATE);
  const late = lateDots.length > 1 ? toPath(lateDots) : '';
  const area = `${toPath(pts)}L${x(pts[pts.length - 1].level).toFixed(1)},${PAD.t + ih}L${x(pts[0].level).toFixed(1)},${PAD.t + ih}Z`;
  const tipLeft = fp ? Math.min(Math.max(x(fp.level), 90), W - 90) : 0;

  return (
    <div className="exp-chart" ref={box}>
      <svg
        width={W}
        height={H}
        role="img"
        aria-label={KINDS[kind].label}
        onPointerMove={move}
        onPointerLeave={() => onHover(null)}
        onPointerDown={(e) => onPick(levelAt(e.clientX, e.currentTarget.getBoundingClientRect()))}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="grid-line" />
            <text x={PAD.l - 6} y={y(t)} dy="0.32em" textAnchor="end" className="axis">{short(t)}</text>
          </g>
        ))}
        {[1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((lv) => (
          <text key={lv} x={x(lv)} y={H - 8} textAnchor="middle" className="axis">{lv}</text>
        ))}
        <path d={area} className="area" />
        <path d={line} className="line" />
        {late && <path d={late} className="line late" />}
        {mine && pts.some((p) => p.level === mine.level) && (
          <g className="mine">
            <line x1={x(mine.level)} x2={x(mine.level)} y1={PAD.t} y2={PAD.t + ih} />
            <text x={x(mine.level) + 4} y={PAD.t + 10}>{mine.name}</text>
          </g>
        )}
        {fp && (
          <g className="focus">
            <line x1={x(fp.level)} x2={x(fp.level)} y1={PAD.t} y2={PAD.t + ih} />
            <circle cx={x(fp.level)} cy={y(val(fp))} r={5} />
          </g>
        )}
      </svg>
      {fp && (
        <div className="exp-tip" style={{ left: tipLeft }}>
          <b>Lv {fp.level}</b>
          <span>{KINDS[kind].tip(fp)}</span>
        </div>
      )}
    </div>
  );
}

export default function ExpCurve({ params }: PageProps) {
  const { character } = useActive();
  const fromUrl = Number(params.get('lv'));
  const [level, setLevel] = useState(() => (fromUrl >= 1 && fromUrl <= MAX_LEVEL ? fromUrl : character?.level ?? 30));
  // A new ?lv= link while the page is open moves the slider too.
  useEffect(() => {
    if (fromUrl >= 1 && fromUrl <= MAX_LEVEL) setLevel(fromUrl);
  }, [fromUrl]);
  const [hover, setHover] = useState<number | null>(null);
  const [scale, setScale] = useState<Scale>('log');
  const mine = character ? { level: character.level, name: character.name } : null;

  const p = CURVE[level - 1];
  const prev = CURVE[level - 2];
  const lastShare = 1 - shareOfJourney(MAX_LEVEL - 1);
  const share = shareOfJourney(level);
  const allBefore = p.cumulative;
  const growth = prev && prev.marginal > 0 && p.marginal > 0 ? p.marginal / prev.marginal : null;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>EXP curve</h1>
          <p>How much EXP each level takes, and how it piles up on the way to {MAX_LEVEL}.</p>
        </div>
      </div>

      <div className="card">
        <div className="exp-slider">
          <label htmlFor="exp-lv" className="small muted">Level</label>
          <input id="exp-lv" type="range" min={1} max={MAX_LEVEL} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
          <input
            type="number"
            min={1}
            max={MAX_LEVEL}
            value={level}
            aria-label="Level"
            onChange={(e) => {
              const n = Math.round(Number(e.target.value));
              if (n >= 1 && n <= MAX_LEVEL) setLevel(n);
            }}
          />
          {mine && mine.level !== level && (
            <button className="btn" onClick={() => setLevel(mine.level)}>{mine.name} (Lv {mine.level})</button>
          )}
        </div>
        <div className="grid exp-stats" style={{ marginTop: 14 }}>
          <Stat
            label={`Lv ${level} → ${level + 1} (marginal)`}
            value={p.marginal > 0 ? `${fmt(p.marginal)} EXP` : 'Level cap'}
            sub={`Everything it takes to level up from ${level}`}
          />
          <Stat label={`Total EXP to reach Lv ${level} (cumulative)`} value={`${fmt(allBefore)} EXP`} sub={`Everything from Lv 1 to ${level - 1}`} />
          <Stat
            label={`Increase over Lv ${level - 1} (marginal increase)`}
            value={p.increase != null ? `+${fmt(p.increase)} EXP` : '—'}
            sub={growth ? `×${fmt(growth, 2)} the level before (+${fmt((growth - 1) * 100, 1)}%)` : level === 1 ? 'Nothing before Lv 1' : 'No level-up at the cap'}
          />
          <Stat
            label={`Share of the road to ${MAX_LEVEL}`}
            value={share < 0.001 && share > 0 ? '<0.1%' : `${fmt(share * 100, share < 0.1 ? 2 : 1)}%`}
            sub={`Lv ${MAX_LEVEL - 1} → ${MAX_LEVEL} alone is ${fmt(lastShare * 100)}% of it all`}
          />
        </div>
        {p.marginal > 0 && allBefore > 0 && (
          <p className="small muted" style={{ marginBottom: 0 }}>
            {p.marginal >= allBefore
              ? `This one level takes ${fmt(p.marginal / allBefore, 1)}× all ${level - 1} levels before it put together.`
              : `This one level takes as much EXP as levels 1 to ${CURVE.find((q) => q.cumulative + q.marginal >= p.marginal)?.level ?? 1} put together.`}
          </p>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>EXP to next level</h2>
          <div className="seg" role="group" aria-label="Scale for all three charts" title="Scale for all three charts">
            <button className={scale === 'log' ? 'on' : ''} onClick={() => setScale('log')}>Log</button>
            <button className={scale === 'linear' ? 'on' : ''} onClick={() => setScale('linear')}>Linear</button>
          </div>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>Marginal: EXP to go from each level to the next. Hover to read a level, click to pick it.</p>
        <CurveChart kind="marginal" scale={scale} selected={level} mine={mine} hover={hover} onHover={setHover} onPick={setLevel} />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Total EXP to reach each level</h2>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>Cumulative: all the EXP from Lv 1. On the linear scale nearly everything happens after 90.</p>
        <CurveChart kind="cumulative" scale={scale} selected={level} mine={mine} hover={hover} onHover={setHover} onPick={setLevel} />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Increase from the level before</h2>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>
          Marginal increase: how much more EXP this level needs than the last one. Watch the jump at Lv 6 (135 → 372) and the dip at Lv 51, where the table settles into a steady ~5.5% a level.
        </p>
        <CurveChart kind="increase" scale={scale} selected={level} mine={mine} hover={hover} onHover={setHover} onPick={setLevel} />
      </div>

      <div className="card">
        <p className="small" style={{ margin: 0 }}>
          From <a href={EXP_TABLE_SOURCE.source_url} target="_blank" rel="noreferrer">{EXP_TABLE_SOURCE.source_title}</a> <StatusPill status={EXP_TABLE_SOURCE.verification_status} />{' '}
          <span className="muted">
            retrieved {EXP_TABLE_SOURCE.retrieved_at}. From Lv 90 the table roughly doubles every level (5.7M at 89, 9.5B at 99); that jump isn't checked in game yet, so
            treat levels 90+ as unconfirmed (the dashed part of each line).
          </span>
        </p>
        <details style={{ marginTop: 10 }}>
          <summary className="small">Table of every level</summary>
          <table className="exp-table">
            <thead>
              <tr><th>Level</th><th>EXP to next (marginal)</th><th>Total to reach (cumulative)</th><th>Increase over previous</th></tr>
            </thead>
            <tbody>
              {CURVE.map((q) => (
                <tr key={q.level} className={q.level === level ? 'on' : ''} onClick={() => setLevel(q.level)}>
                  <td>{q.level}</td>
                  <td>{q.marginal ? fmt(q.marginal) : '—'}</td>
                  <td>{fmt(q.cumulative)}</td>
                  <td>{q.increase != null ? `+${fmt(q.increase)}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
    </div>
  );
}
