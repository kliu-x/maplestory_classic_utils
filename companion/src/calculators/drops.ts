import type { Item, Monster } from '../models/types';

// Drop tables are server-side and not in the client files, so we only guess who drops a
// quest item from names the game files do contain. Every guess says how it was made.

export type DropClue = 'reported' | 'item-name' | 'item-text';

export interface LikelyDropper {
  mob: Monster;
  clue: DropClue;
}

const norm = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

/**
 * Monsters that probably drop `item` (e.g. "Orange Mushroom Cap" -> Orange Mushroom).
 * Only monsters that spawn somewhere count. Strongest clue first; longest name wins a tie
 * so "Horny Mushroom Cap" picks Horny Mushroom, not Mushroom.
 */
export function likelyDroppers(item: Item | undefined, mobs: Monster[], reports: { itemId: number; mobName: string }[] = []): LikelyDropper[] {
  if (!item) return [];
  const live = mobs.filter((m) => m.spawns.length > 0);
  const seen = reports.filter((r) => r.itemId === item.id).map((r) => r.mobName);
  const reported = live.filter((m) => seen.includes(m.name)).map((mob) => ({ mob, clue: 'reported' as const }));
  const guessed = guessDroppers(item, live).filter((d) => !seen.includes(d.mob.name));
  return [...reported, ...guessed];
}

function guessDroppers(item: Item, live: Monster[]): LikelyDropper[] {
  const name = norm(item.name);
  const text = norm(item.description ?? '');
  const byLength = [...live].sort((a, b) => b.name.length - a.name.length);

  const prefix = byLength.find((m) => name.startsWith(norm(m.name)) || name.startsWith(norm(m.name).replace(/ $/, ' s ')));
  if (prefix) return live.filter((m) => m.name === prefix.name).map((mob) => ({ mob, clue: 'item-name' }));

  const said = (m: Monster) => text.includes(norm(m.name)) || text.includes(norm(m.name).replace(/ $/, 's '));
  const inText: Monster[] = [];
  for (const m of byLength) if (said(m) && !inText.some((t) => norm(t.name).includes(norm(m.name)))) inText.push(m);
  // Quest text alone is too loose (it names crafting NPCs' monsters too), so no guess from it.
  return inText.slice(0, 2).map((mob) => ({ mob, clue: 'item-text' }));
}
