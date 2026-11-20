import { useState, type ReactNode } from 'react';
import { href } from '../router';
import { TrackerImport } from './TrackerImport';

// Two ways to measure your real EXP rate, side by side, so it's obvious which to pick:
// 1. record right here in the browser (nothing to install), or
// 2. the Maple EXP Tracker app (a Windows overlay), then import its log here.
// The browser recorder stays mounted while hidden so switching tabs never stops a recording.

type Way = 'browser' | 'app';
const KEY = 'mcw-companion:trackerWay';

function loadWay(): Way {
  try {
    return localStorage.getItem(KEY) === 'app' ? 'app' : 'browser';
  } catch {
    return 'browser';
  }
}

function Option({ on, onPick, icon, title, tag, points }: { on: boolean; onPick: () => void; icon: string; title: string; tag: string; points: string[] }) {
  return (
    <button type="button" className={`way-option ${on ? 'on' : ''}`} onClick={onPick} aria-pressed={on}>
      <span className="way-head">
        <span className="way-icon" aria-hidden>{icon}</span>
        <span>
          <strong>{title}</strong>
          <span className="way-tag">{tag}</span>
        </span>
        <span className="way-radio" aria-hidden />
      </span>
      <ul>
        {points.map((p) => <li key={p}>{p}</li>)}
      </ul>
    </button>
  );
}

export function TrackerChooser({ recorder }: { recorder: ReactNode }) {
  const [way, setWay] = useState<Way>(loadWay);
  const pick = (w: Way) => {
    setWay(w);
    try {
      localStorage.setItem(KEY, w);
    } catch {
      // Not remembered; it still works.
    }
  };

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Track your EXP</h2>
          <span className="small muted">Pick one. Both save to your sessions below.</span>
        </div>
        <div className="way-grid" role="group" aria-label="How to track EXP">
          <Option
            on={way === 'browser'}
            onPick={() => pick('browser')}
            icon="🌐"
            title="Record in this browser"
            tag="Easiest · nothing to install"
            points={['Press Start and share the game window', 'EXP/min, kills, MP per EXP', 'Keep this tab open while you play']}
          />
          <Option
            on={way === 'app'}
            onPick={() => pick('app')}
            icon="🖥️"
            title="Maple EXP Tracker app"
            tag="Most accurate · Windows"
            points={['A small window next to the game', 'EXP/hr, mesos/hr, chat buy/sell prices', 'One-time setup (~10 min), then import here']}
          />
        </div>
      </div>

      <div hidden={way !== 'browser'}>{recorder}</div>

      {way === 'app' && (
        <div className="card">
          <div className="card-head">
            <h2>Use the Maple EXP Tracker app</h2>
          </div>
          <ol className="way-steps">
            <li>
              <strong>Get it once:</strong> <a href={href('tracker')}>download and set it up</a> (install Python, run <code>install.bat</code>).
            </li>
            <li>
              <strong>Play with it on:</strong> run <code>run.bat</code>, pick your map, press Start.
            </li>
            <li>
              <strong>Bring it here:</strong> press the button below and pick <code>session_log.json</code> (and <code>market_log.json</code> for chat prices) from the tracker's <code>data</code> folder.
            </li>
          </ol>
          <TrackerImport />
        </div>
      )}
    </>
  );
}
