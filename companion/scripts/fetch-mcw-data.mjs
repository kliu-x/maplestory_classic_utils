// Step 1 of the dataset refresh workflow: download MapleStory Classic World (region MCW,
// version 1) game data from the community maplestory.io API into data-raw/.
//
//   node scripts/fetch-mcw-data.mjs            # fetch only what is missing
//   node scripts/fetch-mcw-data.mjs --refresh  # re-download everything
//   node scripts/fetch-mcw-data.mjs --refresh=maps,items   # re-download only some kinds
//
// Polite by design: one request at a time, >=300 ms apart, retries with backoff.
// Raw responses are trimmed (sprites/footholds dropped) before saving. Kinds: mobs, maps,
// skillbooks, quests, items (names of items quests ask for), npcs.
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data-raw', 'mcw-1');
const API = 'https://maplestory.io/api/MCW/1';
const refreshArg = process.argv.find((a) => a.startsWith('--refresh'));
const REFRESH_KINDS = refreshArg === '--refresh' ? null : new Set((refreshArg?.split('=')[1] ?? '').split(',').filter(Boolean));
const REFRESH = !!refreshArg;
const refreshes = (kind) => REFRESH && (!REFRESH_KINDS || REFRESH_KINDS.has(kind));
const DELAY_MS = 300;
// Job ids whose skillbooks are fetched. 3rd job ids currently return HTTP 500 (not in the launch build).
const JOBS = [0, 100, 110, 120, 130, 200, 210, 220, 230, 300, 310, 320, 400, 410, 420, 500, 510, 520];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
let fetched = 0;

async function getJson(path) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = last + DELAY_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    try {
      const res = await fetch(API + path, { headers: { Accept: 'application/json', 'User-Agent': 'mcw-companion-data-refresh/0.1 (personal)' } });
      if (res.status === 404 || res.status === 500) return { __status: res.status };
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) return { __status: res.status };
      return await res.json();
    } catch (e) {
      const backoff = 1000 * 2 ** attempt;
      console.warn(`  ${path}: ${e.message}; retrying in ${backoff} ms`);
      await sleep(backoff);
    }
  }
  return { __status: 'failed' };
}

async function exists(p) {
  try { await access(p); return true; } catch { return false; }
}

async function save(rel, data) {
  const p = join(RAW, rel);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(data, null, 1));
}

async function cached(rel, path, trim = (x) => x, kind = rel.split('/')[0].replace(/-list\.json$|\.json$/, '') + 's') {
  const p = join(RAW, rel);
  if (!refreshes(kind) && (await exists(p))) return JSON.parse(await readFile(p, 'utf8'));
  const data = await getJson(path);
  fetched++;
  const out = data && data.__status ? data : trim(data);
  await save(rel, out);
  return out;
}

const trimMob = (m) => ({ id: m.id, name: m.name, meta: m.meta });
const trimMap = (m) => ({
  id: Number(m.id), name: m.name, streetName: m.streetName, mapMark: m.mapMark, isTown: m.isTown,
  mobRate: m.mobRate, returnMap: m.returnMap, vrBounds: m.vrBounds && { width: m.vrBounds.width, height: m.vrBounds.height },
  // Minimap pixel = (worldX + centerX) / magnification, same for y.
  miniMap: m.miniMap && { centerX: m.miniMap.centerX, centerY: m.miniMap.centerY, width: m.miniMap.width, height: m.miniMap.height, magnification: m.miniMap.magnification },
  mobs: (m.mobs || []).filter(Boolean).map((s) => ({ id: s.id, x: s.x, y: s.y })),
  npcs: (m.npcs || []).filter(Boolean).map((n) => ({ id: n.id, name: n.name, x: n.x, y: n.y, hidden: !!n.hidden })),
  portals: (m.portals || []).filter((p) => p && p.toMap && p.toMap !== 999999999).map((p) => ({ toMap: p.toMap, portalName: p.portalName, x: p.x, y: p.y })),
});
const trimNpc = (n) => ({ id: n.id, name: n.name, isShop: !!n.isShop });
const trimItem = (i) => ({ id: i.id, name: i.description?.name, description: i.description?.description });
const trimSkillbook = (b) => ({
  id: b.id, description: b.description,
  skills: (b.skills || []).map((s) => ({
    id: s.id, masterLevel: s.masterLevel, requiredSkillLevels: s.requiredSkillLevels, weapons: s.weapons,
    description: s.description && { name: s.description.name, desc: s.description.desc },
    levelProperties: s.levelProperties,
  })),
});
// Quest messages are the short log texts ("Pia asked me to go to #m...#, take out #o...#"):
// they name the maps and monsters a quest needs when the requirements only list an item.
const trimQuest = (q) => q;

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`Fetching ${API} -> ${RAW}${REFRESH ? ' (refresh)' : ''}`);

  const mobs = await cached('mob-list.json', '/mob');
  for (const [i, m] of mobs.entries()) {
    await cached(`mob/${m.id}.json`, `/mob/${m.id}`, trimMob);
    if (i % 20 === 0) console.log(`  mobs ${i}/${mobs.length}`);
  }

  const maps = await cached('map-list.json', '/map');
  for (const [i, m] of maps.entries()) {
    await cached(`map/${m.id}.json`, `/map/${m.id}`, trimMap);
    if (i % 25 === 0) console.log(`  maps ${i}/${maps.length}`);
  }

  for (const job of JOBS) await cached(`skillbook/${job}.json`, `/job/${job}/skillbook`, trimSkillbook);

  const quests = await cached('quest-list.json', '/quest');
  for (const [i, q] of quests.entries()) {
    await cached(`quest/${q.id}.json`, `/quest/${q.id}`, trimQuest);
    if (i % 25 === 0) console.log(`  quests ${i}/${quests.length}`);
  }

  // Names of the items quests ask you to collect.
  const itemIds = new Set();
  for (const q of quests) {
    const d = await cached(`quest/${q.id}.json`, `/quest/${q.id}`, trimQuest);
    for (const it of d.requirementToComplete?.items || []) if (it.count > 0) itemIds.add(it.id);
    // ...and items the quest texts mention (#t4000016#)
    for (const m of d.messages || []) for (const t of String(m).matchAll(/#[tz]0*(\d+)/g)) itemIds.add(Number(t[1]));
  }
  console.log(`  items: ${itemIds.size}`);
  for (const id of itemIds) await cached(`item/${id}.json`, `/item/${id}`, trimItem);

  // NPCs on maps and in quests: name and picture link (map files carry only ids/positions).
  const npcIds = new Set();
  for (const m of maps) for (const n of (await cached(`map/${m.id}.json`, `/map/${m.id}`, trimMap)).npcs || []) npcIds.add(n.id);
  for (const q of quests) {
    const d = await cached(`quest/${q.id}.json`, `/quest/${q.id}`, trimQuest);
    for (const id of [d.requirementToStart?.npcId, d.requirementToComplete?.npcId]) if (id != null) npcIds.add(id);
  }
  console.log(`  npcs: ${npcIds.size}`);
  for (const id of npcIds) await cached(`npc/${id}.json`, `/npc/${id}`, trimNpc);

  if (fetched) await save('_meta.json', { source: API, retrieved_at: startedAt, finished_at: new Date().toISOString(), requests: fetched });
  console.log(`Done (${fetched} requests). Now run: npm run data:build`);
}

main().catch((e) => { console.error(e); process.exit(1); });
