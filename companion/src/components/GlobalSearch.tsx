import { useMemo, useRef, useState } from 'react';
import { MAPS, MONSTERS, QUESTS, SKILLS } from '../data';
import { go, type PageId } from '../router';

interface Hit {
  kind: 'Monster' | 'Map' | 'Skill' | 'Quest';
  label: string;
  sub: string;
  page: PageId;
  params: Record<string, string | number>;
}

// Prebuilt lower-case index: instant, no network.
const INDEX: (Hit & { key: string })[] = [
  ...MONSTERS.map((m) => ({ kind: 'Monster' as const, label: m.name, sub: `Lv ${m.level} · ${m.hp.toLocaleString()} HP · ${m.exp} EXP`, page: 'monsters' as const, params: { id: m.id }, key: m.name.toLowerCase() })),
  ...MAPS.map((m) => ({ kind: 'Map' as const, label: m.name, sub: `${m.street}${m.region ? ' · ' + m.region : ''}`, page: 'maps' as const, params: { id: m.id }, key: `${m.name} ${m.street}`.toLowerCase() })),
  ...SKILLS.filter((s) => !s.hidden).map((s) => ({ kind: 'Skill' as const, label: s.name, sub: `Max Lv ${s.masterLevel} · job ${s.jobId}`, page: 'skills' as const, params: { skill: s.id }, key: s.name.toLowerCase() })),
  ...QUESTS.map((q) => ({ kind: 'Quest' as const, label: q.name, sub: `Lv ${q.minLevel}+ · ${q.exp.toLocaleString()} EXP · ${q.area}`, page: 'quests' as const, params: { id: q.id }, key: `${q.name} ${q.area}`.toLowerCase() })),
];

export function GlobalSearch() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hl, setHl] = useState(0);
  const box = useRef<HTMLInputElement>(null);

  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    const starts = INDEX.filter((h) => h.key.startsWith(t));
    const contains = INDEX.filter((h) => !h.key.startsWith(t) && h.key.includes(t));
    return [...starts, ...contains].slice(0, 12);
  }, [q]);

  const pick = (h: Hit) => {
    go(h.page, h.params);
    setQ('');
    setOpen(false);
    box.current?.blur();
  };

  return (
    <div className="search">
      <span className="ico">⌕</span>
      <input
        ref={box}
        type="search"
        placeholder="Search monsters, maps, skills, quests…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setHl(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setHl((h) => Math.min(h + 1, hits.length - 1));
          else if (e.key === 'ArrowUp') setHl((h) => Math.max(h - 1, 0));
          else if (e.key === 'Enter' && hits[hl]) pick(hits[hl]);
          else if (e.key === 'Escape') setOpen(false);
        }}
        aria-label="Global search"
      />
      {open && hits.length > 0 && (
        <div className="search-results" role="listbox">
          {hits.map((h, i) => (
            <button key={`${h.kind}-${h.label}-${i}`} className={i === hl ? 'hl' : ''} onMouseDown={() => pick(h)}>
              <span className="pill neutral" style={{ minWidth: 58, justifyContent: 'center' }}>{h.kind}</span>
              <span>
                <strong>{h.label}</strong>
                <div className="small muted">{h.sub}</div>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
