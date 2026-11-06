import { useEffect, useRef } from 'react';

/**
 * A search box that only filters what this page shows (the top bar's search goes to other
 * pages). Esc clears it; "/" jumps to it when nothing else is being typed in.
 */
export function PageFilter({ value, onChange, placeholder = 'Filter this page', shown }: { value: string; onChange: (v: string) => void; placeholder?: string; shown?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === '/' && !t.closest('input, textarea, select, [contenteditable]')) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="page-filter">
      <span className="page-filter-ico" aria-hidden>⌕</span>
      <input
        ref={ref}
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')}
      />
      {value && shown && <span className="small muted page-filter-count">{shown}</span>}
      {value && <button className="btn ghost small" onClick={() => onChange('')} aria-label="Clear filter">✕</button>}
    </div>
  );
}
