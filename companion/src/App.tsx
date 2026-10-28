import { GlobalSearch } from './components/GlobalSearch';
import { PAGES, href, useRoute } from './router';
import { setActive, useAppState } from './storage/store';
import { JOBS } from './data/rules';
import { DATA_META } from './data';
import Dashboard from './pages/Dashboard';
import Characters from './pages/Characters';
import Training from './pages/Training';
import Monsters from './pages/Monsters';
import SkillsPage from './pages/Skills';
import Gear from './pages/Gear';
import Quests from './pages/Quests';
import Maps from './pages/Maps';
import NameChecker from './pages/NameChecker';
import Sources from './pages/Sources';
import Pastas from './pages/Pastas';

const VIEWS = {
  dashboard: Dashboard,
  characters: Characters,
  training: Training,
  monsters: Monsters,
  skills: SkillsPage,
  gear: Gear,
  quests: Quests,
  maps: Maps,
  pastas: Pastas,
  names: NameChecker,
  sources: Sources,
};

function Nav({ page }: { page: string }) {
  return (
    <>
      {PAGES.map((p) => (
        <a key={p.id} href={href(p.id)} className={`nav-link ${page === p.id ? 'active' : ''}`}>
          <span className="ico" aria-hidden>{p.ico}</span>
          {p.label}
        </a>
      ))}
    </>
  );
}

export default function App() {
  const route = useRoute();
  const state = useAppState();
  const View = VIEWS[route.page];
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span style={{ fontSize: 26 }} aria-hidden>🍁</span>
          <span>
            Classic Companion
            <small>MapleStory Classic World</small>
          </span>
        </div>
        <Nav page={route.page} />
        <div className="sidebar-foot">
          Game data: MCW v1 · retrieved {DATA_META.retrieved_at.slice(0, 10)}
          <br />
          <a href={href('sources')}>Sources &amp; caveats</a>
        </div>
      </aside>
      <div className="main">
        <nav className="mobile-nav" aria-label="Sections">
          <Nav page={route.page} />
        </nav>
        <header className="topbar">
          <GlobalSearch />
          <span className="spacer" />
          {state.characters.length > 0 && (
            <label className="char-switch row" style={{ gap: 6 }}>
              <span className="small muted">Character</span>
              <select value={state.settings.activeCharacterId ?? ''} onChange={(e) => setActive(e.target.value)}>
                {state.characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · Lv {c.level} {JOBS[c.job].label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </header>
        <main className="content">
          <View params={route.params} />
        </main>
      </div>
    </div>
  );
}
