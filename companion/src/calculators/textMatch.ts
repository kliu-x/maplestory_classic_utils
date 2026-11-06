// In-page filtering: does a row match what was typed? Every word of the query must appear
// somewhere in the row's texts (any order, any case, accents ignored). Empty query matches all.

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function queryWords(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean);
}

export function matchesQuery(query: string, ...texts: (string | number | null | undefined | false)[]): boolean {
  const words = queryWords(query);
  if (!words.length) return true;
  const hay = fold(texts.filter((t) => t !== null && t !== undefined && t !== false).join(' '));
  return words.every((w) => hay.includes(w));
}
