import type { SourceMeta } from '../models/types';
import meta from './generated/meta.json';

// Every citation used in the app. Records point at one of these (or carry their own).
const R = '2026-10-26';

export const SOURCES = {
  mcwData: {
    source_url: 'https://maplestory.io/api/MCW/1',
    source_title: 'maplestory.io: MapleStory Classic World game data (region MCW, version 1)',
    retrieved_at: meta.retrieved_at.slice(0, 10),
    game_version_or_date: 'MCW v1 (Grand Launch, Oct 2026)',
    verification_status: 'verified',
    notes:
      'Extracted from the Classic World client files by a community API. Values are game-file data, not observations. ' +
      'IDs are Classic-World-specific and do not match pre-Big-Bang GMS.',
  },
  launchNotes: {
    source_url: 'https://www.nexon.com/maplestory/news/general/46506',
    source_title: 'Nexon: MapleStory Classic World Grand Launch notes',
    retrieved_at: R,
    game_version_or_date: '2026-10-21',
    verification_status: 'verified',
  },
  cot2Notes: {
    source_url: 'https://www.nexon.com/maplestory/news/general/43432',
    source_title: 'Nexon: Classic World Closed Online Test #2 notes',
    retrieved_at: R,
    game_version_or_date: 'COT2 (pre-launch)',
    verification_status: 'verified',
    notes: 'Test-build information. 3rd job (Lv 70) was in COT2 but is not in the launch build.',
  },
  faq: {
    source_url: 'https://www.nexon.com/maplestory/news/general/45385',
    source_title: 'Nexon: Classic World FAQ',
    retrieved_at: R,
    verification_status: 'verified',
  },
  meowBeginner: {
    source_url: 'https://meowdb.com/msclassic/guides/beginners-guide-first-steps-in-maple-world',
    source_title: 'MeowDB: Beginner guide (Classic World)',
    retrieved_at: R,
    verification_status: 'community_reported',
  },
  meowMage: {
    source_url: 'https://meowdb.com/msclassic/guides/magician-class-guide',
    source_title: 'MeowDB: Magician class guide (Classic World)',
    retrieved_at: R,
    verification_status: 'community_reported',
  },
  meowDamage: {
    source_url: 'https://meowdb.com/msclassic/guides/explaining-the-damage-formula',
    source_title: 'MeowDB: Explaining the damage formula',
    retrieved_at: R,
    verification_status: 'community_reported',
    notes: 'Not stated to be verified against Classic World; structure resembles pre-Big-Bang formulas.',
  },
  meowKpq: {
    source_url: 'https://meowdb.com/msclassic/guides/kerning-city-party-quest-kpq-guide',
    source_title: 'MeowDB: Kerning City Party Quest guide',
    retrieved_at: R,
    verification_status: 'community_reported',
  },
  legacyElem: {
    source_url: 'https://maplestory.io/api/MCW/1/mob',
    source_title: 'WZ elemAttr convention (1 = immune, 2 = resist, 3 = weak), carried over from pre-Big-Bang',
    retrieved_at: R,
    verification_status: 'unverified',
    notes: 'The codes come from Classic World files; how Classic World applies them has not been confirmed.',
  },
  assumption: {
    source_url: '',
    source_title: 'App default assumption (edit it in Training > Assumptions)',
    retrieved_at: R,
    verification_status: 'unverified',
  },
  classicRank: {
    source_url: 'https://classicrank.com/developer',
    source_title: 'ClassicRank (Windia Rankings) public API',
    retrieved_at: R,
    verification_status: 'community_reported',
  },
} satisfies Record<string, SourceMeta>;

export type SourceKey = keyof typeof SOURCES;
