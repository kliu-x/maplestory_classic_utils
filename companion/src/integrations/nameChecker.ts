// Adapter for results.json produced by ../pokemon_name_checker (Project 1).
// The checker is an independent tool; this only reads its output.

export const NAME_STATUSES = {
  found: { label: 'Found in rankings (likely taken)', tone: 'conflicting' },
  not_found_in_source: { label: 'Not found in source: availability unconfirmed', tone: 'unverified' },
  error_unknown: { label: 'Error / unknown', tone: 'neutral' },
  invalid_for_source: { label: 'Not a valid name for this source', tone: 'neutral' },
  confirmed_available: { label: 'Confirmed available (manual in-game check)', tone: 'verified' },
  confirmed_unavailable: { label: 'Confirmed unavailable (manual in-game check)', tone: 'conflicting' },
} as const;

export type NameStatus = keyof typeof NAME_STATUSES;

export interface NameRow {
  pokemon_name: string;
  lookup_name: string;
  generation: number;
  popularity_rank: number | null;
  world: string;
  lookup_status: NameStatus;
  matched_character_name: string;
  matched_level: number | null;
  matched_job: string;
  source: string;
  checked_at_utc: string;
  notes: string;
}

export interface NameResults {
  generated_at_utc: string;
  rows: NameRow[];
}

export function parseNameResults(text: string): NameResults {
  const data = JSON.parse(text);
  const rows = Array.isArray(data) ? data : data?.results;
  if (!Array.isArray(rows)) throw new Error('Expected results.json from the name checker (a "results" array).');
  return {
    generated_at_utc: typeof data?.generated_at_utc === 'string' ? data.generated_at_utc : '',
    rows: rows.map((r: Record<string, unknown>, i: number) => {
      const status = String(r.lookup_status ?? '');
      if (!(status in NAME_STATUSES)) throw new Error(`Row ${i + 1}: unknown lookup_status "${status}".`);
      return {
        pokemon_name: String(r.pokemon_name ?? ''),
        lookup_name: String(r.lookup_name ?? r.pokemon_name ?? ''),
        generation: Number(r.generation ?? 0),
        popularity_rank: r.popularity_rank == null || r.popularity_rank === '' ? null : Number(r.popularity_rank),
        world: String(r.world ?? ''),
        lookup_status: status as NameStatus,
        matched_character_name: String(r.matched_character_name ?? ''),
        matched_level: r.matched_level == null || r.matched_level === '' ? null : Number(r.matched_level),
        matched_job: String(r.matched_job ?? ''),
        source: String(r.source ?? ''),
        checked_at_utc: String(r.checked_at_utc ?? ''),
        notes: String(r.notes ?? ''),
      };
    }),
  };
}
