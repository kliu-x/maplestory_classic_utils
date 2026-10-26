import { useEffect, useState, type ReactNode } from 'react';
import type { Monster, SourceMeta, VerificationStatus } from '../models/types';

export const STATUS_LABEL: Record<VerificationStatus, string> = {
  verified: 'Verified',
  community_reported: 'Community',
  unverified: 'Unverified',
  conflicting: 'Conflicting',
};

export function StatusPill({ status, title }: { status: VerificationStatus; title?: string }) {
  return (
    <span className={`pill ${status}`} title={title}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Verification pill that links to the underlying source. */
export function SourceBadge({ source, compact }: { source: SourceMeta; compact?: boolean }) {
  const title = `${source.source_title}\nRetrieved ${source.retrieved_at}${source.game_version_or_date ? `\nVersion: ${source.game_version_or_date}` : ''}${source.notes ? `\n${source.notes}` : ''}`;
  const pill = <StatusPill status={source.verification_status} title={title} />;
  return (
    <span className="row" style={{ gap: 6, display: 'inline-flex' }}>
      {source.source_url ? (
        <a href={source.source_url} target="_blank" rel="noreferrer" title={title}>
          {pill}
        </a>
      ) : (
        pill
      )}
      {!compact && <span className="small muted">{source.source_title}</span>}
    </span>
  );
}

const PROV_LABEL = { measured: 'Measured', projected: 'Projected', estimated: 'Estimate', none: 'No data' } as const;
const PROV_TITLE = {
  measured: 'Uses damage you recorded on this monster.',
  projected: 'Uses damage you recorded on another monster, rescaled by the defense / level / element models.',
  estimated: 'Uses the community damage formula and your stats. Record real damage to replace this.',
  none: 'No damage information.',
} as const;

export function ProvenancePill({ p }: { p: keyof typeof PROV_LABEL }) {
  return (
    <span className={`pill ${p}`} title={PROV_TITLE[p]}>
      {PROV_LABEL[p]}
    </span>
  );
}

export function ElemTags({ m }: { m: Monster }) {
  const entries = Object.entries(m.elements);
  return (
    <>
      {entries.map(([el, eff]) => (
        <span key={el} className={`elem ${eff}`} title={`${eff} to ${el} (raw code ${m.elemRaw}; mapping is the legacy convention, unverified)`}>
          {eff === 'weak' ? '▲' : eff === 'immune' ? '✕' : '▼'} {el}
        </span>
      ))}
      {m.undead && <span className="elem" title="Undead">undead</span>}
    </>
  );
}

export function NumField({
  label, value, onChange, step = 1, min, max, width, title,
}: {
  label: ReactNode; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; width?: number; title?: string;
}) {
  // Keep a local string so users can clear the box while typing.
  const [text, setText] = useState(String(value));
  useEffect(() => {
    if (Number(text) !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <label className="field" title={title}>
      {label}
      <input
        type="number"
        inputMode="decimal"
        value={text}
        step={step}
        min={min}
        max={max}
        style={width ? { width } : undefined}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== '' && Number.isFinite(n)) onChange(n);
        }}
      />
    </label>
  );
}

export function Stat({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

// ---------- formatting ----------
export const fmt = (n: number, digits = 0) =>
  !Number.isFinite(n) ? '∞' : n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const fmt1 = (n: number) => fmt(n, 1);
export const pct = (n: number) => `${fmt(n * 100)}%`;
export function minutes(m: number | null) {
  if (m == null || !Number.isFinite(m)) return '—';
  if (m < 60) return `${fmt(m)} min`;
  return `${fmt(m / 60, 1)} h`;
}
