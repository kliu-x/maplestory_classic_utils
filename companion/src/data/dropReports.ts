// Drops seen in game. Drop tables are server-side, so the game files can't tell us these;
// each entry is a player's own observation, with who saw it and when.

import type { SourceMeta } from '../models/types';

export interface DropReport {
  itemId: number;
  mobName: string;
  source: SourceMeta;
}

const userSaw = (date: string): SourceMeta => ({
  source_url: 'in-game',
  source_title: 'Seen in game by the app user',
  retrieved_at: date,
  game_version_or_date: date,
  verification_status: 'community_reported',
  notes: 'One player\'s observation; drop rate unknown.',
});

export const DROP_REPORTS: DropReport[] = [
  // The item text only names Axe Stump.
  { itemId: 4000015, mobName: 'Dark Axe Stump', source: userSaw('2026-10-29') },
];
