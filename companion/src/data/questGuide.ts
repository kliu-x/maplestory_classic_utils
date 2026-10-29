// Quest tips from Classic World guides (henesys.gg, MeowDB, maplestory-classic.com, SSEGold),
// researched 2026-10-28 and written in our own words. A "worth" verdict appears only where a
// guide gave one. Disagreements between sources (or with the game files) are kept as `conflict`.

import type { SourceMeta } from '../models/types';
import raw from './questGuide.json';

export type QuestWorth = 'must-do' | 'good' | 'skip';

export interface QuestTip {
  tip: string;
  worth: QuestWorth | null;
  worthReason: string | null;
  recommendedLevel: number | null;
  chain: string | null;
  sourceIds: string[];
  conflict: string | null;
}

export const QUEST_SOURCES = raw.sources as Record<string, SourceMeta>;
export const QUEST_TIPS = raw.tips as Record<string, QuestTip>;
export const QUEST_GENERAL = raw.general as { topic: string; text: string; sourceIds: string[] }[];

export const tipFor = (questId: number): QuestTip | undefined => QUEST_TIPS[questId];

export const WORTH_LABEL: Record<QuestWorth, string> = { 'must-do': 'Must do', good: 'Worth doing', skip: 'Skip' };

/** Sources for a tip, marked conflicting when the tip records a disagreement. */
export function tipSources(t: { sourceIds: string[]; conflict?: string | null }): SourceMeta[] {
  return t.sourceIds.map((id) => QUEST_SOURCES[id]).filter(Boolean).map((s) => (t.conflict ? { ...s, verification_status: 'conflicting' as const } : s));
}
