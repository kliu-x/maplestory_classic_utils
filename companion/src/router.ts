import { useSyncExternalStore } from 'react';

export const PAGES = [
  { id: 'dashboard', label: 'Dashboard', ico: '◎' },
  { id: 'characters', label: 'Characters', ico: '☺' },
  { id: 'training', label: 'Training', ico: '⚔' },
  { id: 'monsters', label: 'Monsters', ico: '✿' },
  { id: 'skills', label: 'Skills & AP', ico: '✦' },
  { id: 'gear', label: 'Gear', ico: '⛨' },
  { id: 'quests', label: 'Quests', ico: '✎' },
  { id: 'maps', label: 'Maps', ico: '⌖' },
  { id: 'pastas', label: 'Copy Pastas', ico: '✉' },
  { id: 'names', label: 'Name Checker', ico: '⌕' },
  { id: 'links', label: 'Links', ico: '↗' },
  { id: 'sources', label: 'Sources', ico: '§' },
] as const;

export type PageId = (typeof PAGES)[number]['id'];

export interface Route {
  page: PageId;
  params: URLSearchParams;
}

function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = h.split('?');
  const page = (PAGES.find((p) => p.id === path)?.id ?? 'dashboard') as PageId;
  return { page, params: new URLSearchParams(query) };
}

let current = parse();
window.addEventListener('hashchange', () => {
  current = parse();
  window.scrollTo(0, 0);
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      window.addEventListener('hashchange', l);
      return () => window.removeEventListener('hashchange', l);
    },
    () => current,
  );
}

export function href(page: PageId, params?: Record<string, string | number>) {
  const q = params ? '?' + new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString() : '';
  return `#/${page}${q}`;
}

export function go(page: PageId, params?: Record<string, string | number>) {
  window.location.hash = href(page, params);
}
