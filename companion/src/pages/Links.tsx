import type { PageProps } from './shared';
import { href } from '../router';

// Sites worth having one tap away. Only pages we have opened ourselves; MeowDB first
// because it tracks Classic World most closely. Sources & caveats lives off the menu, linked here.

interface LinkTile {
  url: string;
  title: string;
  what: string;
  ico: string;
}

const MEOW = 'https://meowdb.com/msclassic';

const GROUPS: { name: string; links: LinkTile[] }[] = [
  {
    name: 'Look things up',
    links: [
      { ico: '🐌', url: `${MEOW}/monsters`, title: 'MeowDB monsters', what: 'Stats and what players have seen drop' },
      { ico: '🎒', url: `${MEOW}/item-db`, title: 'MeowDB items', what: 'Every item, by type' },
      { ico: '💰', url: `${MEOW}/item-db/safe-to-sell`, title: 'Safe to sell?', what: 'Which drops you can vendor' },
      { ico: '📦', url: `${MEOW}/submit-drops`, title: 'Submit drops', what: 'Add a drop you saw so others can check it' },
      { ico: '🍁', url: MEOW, title: 'MeowDB home', what: 'Everything else for Classic World' },
    ],
  },
  {
    name: 'Guides',
    links: [
      { ico: '🌱', url: `${MEOW}/guides/beginners-guide-first-steps-in-maple-world`, title: 'Beginner guide', what: 'First steps on Maple Island' },
      { ico: '🔮', url: `${MEOW}/guides/magician-class-guide`, title: 'Magician guide', what: 'Skill builds and training' },
      { ico: '🎯', url: `${MEOW}/guides/kerning-city-party-quest-kpq-guide`, title: 'KPQ guide', what: 'Kerning City Party Quest, stage by stage' },
      { ico: '📈', url: `${MEOW}/guides/exp-table-level-1-to-100`, title: 'EXP table', what: 'EXP needed for each level' },
      { ico: '🧮', url: `${MEOW}/guides/explaining-the-damage-formula`, title: 'Damage formula', what: 'How damage is worked out' },
      { ico: '📍', url: `${MEOW}/guides/mark-of-the-beta-event-guide`, title: 'Mark of the Beta', what: 'Pictures of all six event spots' },
    ],
  },
  {
    name: 'Official',
    links: [
      { ico: '📰', url: 'https://www.nexon.com/maplestory/news/general/46506', title: 'Grand Launch notes', what: "Nexon's notes for the launch build" },
      { ico: '❓', url: 'https://www.nexon.com/maplestory/news/general/45385', title: 'Classic World FAQ', what: 'Accounts, worlds, rules' },
    ],
  },
  {
    name: 'Rankings & data',
    links: [
      { ico: '🏆', url: 'https://classicrank.com', title: 'ClassicRank', what: 'Windia character rankings' },
      { ico: '🗂', url: 'https://maplestory.io/api/MCW/1', title: 'maplestory.io (MCW)', what: 'The game-file data this app is built on' },
    ],
  },
];

export default function Links(_: PageProps) {
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Useful links</h1>
          <p>The sites worth keeping handy. They open in a new tab.</p>
        </div>
      </div>
      {GROUPS.map((g) => (
        <div key={g.name} className="card">
          <h2>{g.name}</h2>
          <div className="link-grid">
            {g.links.map((l) => (
              <a key={l.url} className="link-tile" href={l.url} target="_blank" rel="noreferrer">
                <span className="link-ico" aria-hidden>{l.ico}</span>
                <span>
                  <strong>{l.title} ↗</strong>
                  <span className="small muted">{l.what}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      ))}
      <p className="small muted">Where the app's own numbers come from: <a href={href('sources')}>Sources &amp; caveats</a>.</p>
    </>
  );
}
