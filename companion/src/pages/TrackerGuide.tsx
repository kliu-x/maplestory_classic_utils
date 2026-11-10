import type { PageProps } from './shared';
import { href } from '../router';

// Download and setup steps for the Maple EXP Tracker, a separate Windows overlay made by a friend of the project
// (shared here with his OK). The zip is served from this site as it was given to us, plus beanguri's MIT licence.

const ZIP = './downloads/Maple-EXP-Tracker.zip';
const SHA256 = 'ec8df3c6ff76740843ceeefe758ec1c5600ff09f9d0ca9ae04c2e985c68d609d';

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="guide-step">
      <span className="guide-num" aria-hidden>{n}</span>
      <div>
        <h3>{title}</h3>
        {children}
      </div>
    </li>
  );
}

export default function TrackerGuide(_: PageProps) {
  return (
    <div className="guide">
      <div className="page-head">
        <div>
          <h1>Maple EXP Tracker</h1>
          <p>A small window that sits next to the game and shows EXP per hour, time to level, mesos per hour and buy/sell offers from the chat. Windows 10/11.</p>
        </div>
      </div>

      <div className="card guide-download">
        <div>
          <a className="btn primary big" href={ZIP} download>
            ⬇ Download Maple-EXP-Tracker.zip
          </a>
          <div className="small muted" style={{ marginTop: 6 }}>Version 1.0 · 0.8 MB · plain Python scripts, no .exe</div>
        </div>
        <div className="small">
          Made by Chris, a friend of this site, and shared here with his OK. It builds on beanguri's{' '}
          <a href="https://github.com/beanguri/Maple-Classic-Exp-Overlay" target="_blank" rel="noreferrer">Maple-Classic-Exp-Overlay</a> (MIT licence, included in the zip).
          Not made by or affiliated with Nexon.
          <details style={{ marginTop: 6 }}>
            <summary className="muted">Check the download (SHA-256)</summary>
            <code className="hash">{SHA256}</code>
            <div className="muted">In PowerShell: <code>Get-FileHash .\Maple-EXP-Tracker.zip</code></div>
          </details>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Set it up (about 10 minutes, once)</h2></div>
        <p className="small muted" style={{ marginTop: 0 }}>You need Windows 10 or 11, about 300 MB free (mostly Python packages), and the game in <strong>windowed or borderless</strong> mode: the tracker reads the screen and can't see exclusive full screen.</p>
        <ol className="guide-steps">
          <Step n={1} title="Unzip it">
            <p>Right-click the zip, choose <strong>Extract All…</strong> and pick a folder you own, such as Documents. Don't run anything from inside the zip window, and avoid Program Files: the tracker saves its settings next to itself.</p>
          </Step>
          <Step n={2} title="Install Python (skip if you have 3.10 or newer)">
            <p>
              Download Python 3 for Windows from <a href="https://www.python.org/downloads/" target="_blank" rel="noreferrer">python.org/downloads</a>. On the installer's <strong>first screen</strong> tick{' '}
              <strong>Add python.exe to PATH</strong>, then Install Now. That tick box is the step people miss.
            </p>
          </Step>
          <Step n={3} title="Double-click install.bat (once)">
            <p>
              It installs four packages (mss, numpy, opencv-python-headless, pillow) in a minute or three and says <em>Done</em>. This is the only time the tracker uses the internet. If Windows shows
              "Windows protected your PC", click <strong>More info → Run anyway</strong>; a .bat file is plain text you can open in Notepad first.
            </p>
          </Step>
          <Step n={4} title="Double-click run.bat">
            <p>The tracker opens near the top left. Drag it beside the game, <strong>not over the EXP bar</strong> at the bottom. Tip: right-click run.bat → Send to → Desktop (create shortcut).</p>
          </Step>
          <Step n={5} title="Start tracking">
            <p>
              Log in to the game. The chip at the top left of the tracker should read <strong>Ready · Lv 36</strong> (your level). Click the <strong>MAP</strong> line and pick where you're
              training, then press <strong>Start</strong> (or Shift+1). Open your inventory if you want mesos counted.
            </p>
          </Step>
          <Step n={6} title="Optional: read the chat for prices">
            <p>
              Settings (gear) → <strong>Select chat area</strong>: drag a box around the chat text, inside the chat window. Tick <strong>Read the chat for buy / sell offers</strong>. Then{' '}
              <strong>Teach chat font…</strong>: type the three lines it shows into the game's chat and press <em>Learn from the newest 3 lines</em>; until then digits like 2, 3, 4, 8 and 9 show as "?".
            </p>
          </Step>
          <Step n={7} title="Bring it into this site">
            <p>
              On <a href={href('chat')}>Chat Market</a> or at the bottom of <a href={href('training')}>Training</a>, press <strong>Import from Maple EXP Tracker</strong> and pick{' '}
              <code>session_log.json</code> and <code>market_log.json</code> from the tracker's <code>data</code> folder. Sessions join your character's sessions (with mesos/hr); offers become
              asking prices on item pages. Import again whenever you like: repeats are merged. Files are read in your browser, never uploaded.
            </p>
          </Step>
        </ol>
      </div>

      <div className="card">
        <div className="card-head"><h2>Is it working?</h2></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>The chip says</th><th>What to do</th></tr></thead>
            <tbody>
              <tr><td>Ready · Lv 36 (grey)</td><td>Press Start.</td></tr>
              <tr><td>Tracking (green)</td><td>Nothing: it's counting.</td></tr>
              <tr><td>Waiting for EXP (gold)</td><td>No EXP for 15 s, so it paused itself; it carries on by itself.</td></tr>
              <tr><td>MapleStory not found (red)</td><td>Settings → Window, pick the game, press Refresh.</td></tr>
              <tr><td>Can't find / read the EXP bar (red)</td><td>Move anything covering the bottom of the game, or make the game window bigger. Settings → View capture shows what it sees.</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>If something goes wrong</h2></div>
        <ul className="small guide-list">
          <li><strong>"Could not find Python."</strong> Run the Python installer again, choose Modify, tick Add python.exe to PATH, then run install.bat again.</li>
          <li><strong>install.bat shows red errors.</strong> Check the internet connection; antivirus or a school/work network can block the download.</li>
          <li><strong>Nothing opens from run.bat.</strong> Run <code>run_debug.bat</code> instead: it keeps a window open with the error. Also look in <code>data\errors.log</code>.</li>
          <li><strong>The window is off-screen.</strong> Close it and delete <code>data\config.json</code> (settings reset, your log stays).</li>
          <li><strong>Shift+1/2/3 do nothing.</strong> Another program uses those keys; turn hotkeys off in Settings and use the buttons.</li>
          <li><strong>Antivirus warns.</strong> Screen capture looks suspicious to scanners. It's plain .py files you can read; the README lists everything it does.</li>
        </ul>
        <p className="small muted" style={{ marginBottom: 0 }}>
          <strong>Early version:</strong> it was built and tested on simulated screens and screenshots, not yet on many PCs running the game. In your first ten minutes, check that the EXP number matches
          the game. <strong>Updating:</strong> unzip the new version to a new folder and copy your old <code>data</code> folder into it.
        </p>
      </div>

      <div className="card">
        <div className="card-head"><h2>Safety and privacy</h2></div>
        <ul className="small guide-list">
          <li>It only takes pictures of the game window, like a screen recorder. It never opens the game's files or memory and never presses keys or clicks for you.</li>
          <li>No network code: after install.bat, it never goes online. Everything it saves stays in its <code>data</code> folder.</li>
          <li>Whether the game's rules allow tools that read the screen or the chat is <strong>your call</strong>; check Nexon's rules before using it.</li>
        </ul>
      </div>
    </div>
  );
}
