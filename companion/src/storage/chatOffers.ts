import { useSyncExternalStore } from 'react';
import { mergeOffers, type ChatOffer } from '../integrations/expTrackerImport';

// Chat buy/sell offers imported from the Maple EXP Tracker, kept in this browser only (like everything else).
// Separate from the main state so thousands of offers don't slow down every save of a character.

const KEY = 'mcw-companion:chatOffers';
const MAX = 5000;

function load(): ChatOffer[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

let offers: ChatOffer[] = typeof localStorage === 'undefined' ? [] : load();
const listeners = new Set<() => void>();

function save(next: ChatOffer[]) {
  offers = next.slice(-MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(offers));
  } catch {
    // Storage full or blocked: keep them for this visit.
  }
  listeners.forEach((l) => l());
}

export function addChatOffers(incoming: ChatOffer[]): number {
  const m = mergeOffers(offers, incoming);
  save(m.offers);
  return m.added;
}

export function clearChatOffers() {
  save([]);
}

export function useChatOffers(): ChatOffer[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => offers,
  );
}
