// Saved chat messages ("copy pastas") for advertising in game. Kept in this browser only.

import { useEffect, useState } from 'react';
import type { PageProps } from './shared';

const KEY = 'mcw-companion:pastas';

interface Pasta {
  id: string;
  text: string;
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// Starting list until the user saves their own.
const STARTERS: Pasta[] = [
  { id: 'pixhar-ear', text: 'B>60% Ear Scrolls Str40k Dex40k Int45k Luk55k B>10% Overalls 7k' },
  { id: 'pixhar-attack', text: 'B>Attack 60% scroll    claw130k dagger100k wand90k polearm50k bow50k' },
];

function load(): Pasta[] {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === null) return STARTERS;
    const raw = JSON.parse(stored);
    return Array.isArray(raw) ? raw.filter((p) => p && typeof p.text === 'string').map((p) => ({ id: String(p.id ?? uid()), text: p.text })) : [];
  } catch {
    return [];
  }
}

function save(list: Pasta[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked: keep working in memory */
  }
}

// The old copy command runs first, synchronously, while the click still counts as a user
// gesture; some browsers/embeds deny the async clipboard API.
async function copy(text: string) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    /* fall through */
  }
  ta.remove();
  if (ok) return true;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function Pastas(_: PageProps) {
  const [list, setList] = useState<Pasta[]>(load);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [next, setNext] = useState(0);

  const update = (l: Pasta[]) => {
    setList(l);
    save(l);
  };

  const copyOne = async (p: Pasta, i: number) => {
    if (await copy(p.text)) {
      setCopied(p.id);
      setNext((i + 1) % list.length);
      window.setTimeout(() => setCopied((c) => (c === p.id ? null : c)), 1200);
    }
  };

  // 1–9 copies that message; Space copies the next one in rotation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || t.closest('input, textarea, select, [contenteditable]')) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9 && list[n - 1]) {
        e.preventDefault();
        copyOne(list[n - 1], n - 1);
      } else if ((e.key === ' ' || e.code === 'Space') && list.length && !t.closest('button, a')) {
        e.preventDefault();
        const i = next % list.length;
        copyOne(list[i], i);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    update([...list, { id: uid(), text }]);
    setDraft('');
  };

  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const l = [...list];
    [l[i], l[j]] = [l[j], l[i]];
    update(l);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Copy pastas</h1>
          <p>Click a message to copy it, then paste in game with Ctrl+V. Saved in this browser only.</p>
        </div>
      </div>

      {list.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Messages</h2>
            <button className="btn primary" onClick={() => copyOne(list[next % list.length], next % list.length)}>
              Copy next (#{(next % list.length) + 1})
            </button>
          </div>
          <p className="small muted" style={{ marginTop: 0 }}>Keys: <kbd>1</kbd>–<kbd>9</kbd> copy that message, <kbd>Space</kbd> copies the next one in turn.</p>
          <div className="pasta-list">
            {list.map((p, i) =>
              editing === p.id ? (
                <div key={p.id} className="pasta-item editing">
                  <textarea
                    autoFocus
                    rows={2}
                    defaultValue={p.text}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        (e.target as HTMLTextAreaElement).blur();
                      } else if (e.key === 'Escape') setEditing(null);
                    }}
                    onBlur={(e) => {
                      const text = e.target.value.trim();
                      if (text) update(list.map((x) => (x.id === p.id ? { ...x, text } : x)));
                      setEditing(null);
                    }}
                  />
                </div>
              ) : (
                <div key={p.id} className={`pasta-item ${copied === p.id ? 'copied' : ''} ${next % list.length === i ? 'next' : ''}`}>
                  <button className="pasta-text" onClick={() => copyOne(p, i)} title="Click to copy">
                    <span className="pasta-n">{i + 1}</span>
                    <span className="pasta-body">{p.text}</span>
                    <span className="pasta-meta">{copied === p.id ? 'Copied!' : `${p.text.length} chars`}</span>
                  </button>
                  <div className="pasta-tools">
                    <button className="btn ghost small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                    <button className="btn ghost small" onClick={() => move(i, 1)} disabled={i === list.length - 1} aria-label="Move down">↓</button>
                    <button className="btn ghost small" onClick={() => setEditing(p.id)}>Edit</button>
                    <button className="btn ghost small danger" onClick={() => update(list.filter((x) => x.id !== p.id))}>Delete</button>
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Add a message</h2>
        <div className="stack">
          <textarea
            rows={2}
            value={draft}
            placeholder="e.g. S> Work Gloves 10k, PM me"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                add();
              }
            }}
          />
          <div className="row">
            <span className="small muted">{draft.trim().length} chars · Enter to save</span>
            <span className="spacer" />
            <button className="btn primary" onClick={add} disabled={!draft.trim()}>Save</button>
          </div>
        </div>
      </div>
    </>
  );
}
