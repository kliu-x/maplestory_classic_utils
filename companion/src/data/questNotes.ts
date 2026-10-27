import type { SourceMeta } from '../models/types';

// Where to go for quests whose game files only give a riddle (events). These come from
// community guides, not the client, so each carries its sources and a status; when the
// guides disagree, both readings are shown.

export interface QuestNote {
  mapId?: number;
  where: string;
  alternatives?: string[];
  sources: SourceMeta[];
}

const R = '2026-10-27';
const meow: SourceMeta = { source_url: 'https://meowdb.com/msclassic/guides/mark-of-the-beta-event-guide', source_title: 'MeowDB: Mark of the Beta event guide', retrieved_at: R, verification_status: 'community_reported' };
const mscom: SourceMeta = { source_url: 'https://maplestory-classic.com/guides/mark-of-the-beta-event-guide', source_title: 'maplestory-classic.com: Mark of the Beta guide', retrieved_at: R, verification_status: 'community_reported' };
const hgg: SourceMeta = { source_url: 'https://henesys.gg/quests/event-the-marks-we-leave-behind', source_title: 'Henesys.gg: The Marks We Leave Behind', retrieved_at: R, verification_status: 'community_reported' };
const conflicting = (s: SourceMeta): SourceMeta => ({ ...s, verification_status: 'conflicting' });

export const QUEST_NOTES: Record<number, QuestNote> = {
  600007: {
    mapId: 10002004,
    where: "Marr's Forest (off Ellinia): bottom-right corner, at the right end of the lowest platform. Guides call this journal page 4.",
    alternatives: ['Henesys.gg and MapleClassicGuide instead say to climb high in the forest and check the old tree. Check the bottom right first, then climb.'],
    sources: [conflicting(meow), conflicting(mscom), conflicting(hgg)],
  },
  600008: {
    where: 'Kerning City: Mong from Kong, just right of the Pharmacy. He wants 10 mesos for the page (page 5).',
    sources: [meow, mscom],
  },
  600009: {
    mapId: 10004091,
    where: 'The Land of Wild Boar II, a hidden map: its portal is at the very top right of East Domain of Perion. The page is on the second small stepping stone from the left, just before the rope (page 6).',
    sources: [meow, mscom],
  },
  600010: {
    mapId: 10005070,
    where: 'Ant Tunnel Park (past Deep Ant Tunnel II): upper right, just below and to the right of the portal to The Grave of Mushmom. Reward: Mark of the Beta hat.',
    sources: [meow, mscom],
  },
};
