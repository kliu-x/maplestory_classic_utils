// The in-game quest log lists a storyline title ("Legend of the Snail"); clicking in shows
// the quest's own name, which is what the game files contain ("A rainbow snail shell that
// makes wishes come true!?"). Titles here were read off the quest log in game
// (2026-10-27); add more as they turn up so searching by what the log shows works.

export const QUEST_LOG_TITLES: Record<number, string> = {
  // Legend of the Snail
  10126: 'Legend of the Snail',
  10128: 'Legend of the Snail',
  10129: 'Legend of the Snail',
  10130: 'Legend of the Snail',
  // Dr. Betty's Research on Plants (the log cuts it off at "Dr. Betty's Research on Pl...")
  10406: "Dr. Betty's Research on Plants",
  10407: "Dr. Betty's Research on Plants",
  10408: "Dr. Betty's Research on Plants",
  10409: "Dr. Betty's Research on Plants",
  10410: "Dr. Betty's Research on Plants",
  // Maya and the Weird Medicine
  10106: 'Maya and the Weird Medicine',
  10112: 'Maya and the Weird Medicine',
};
