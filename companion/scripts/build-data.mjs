// Step 2 of the dataset refresh workflow: turn data-raw/mcw-1 into the compact, sourced
// JSON the app imports (src/data/generated). Deterministic: same raw input -> same output.
//
//   node scripts/build-data.mjs
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data-raw', 'mcw-1');
const OUT = join(ROOT, 'src', 'data', 'generated');
const API = 'https://maplestory.io/api/MCW/1';

const readJson = async (p) => JSON.parse(await readFile(p, 'utf8'));
const ok = (x) => x && !x.__status;
const num = (v) => (v === undefined || v === null || v === '' ? undefined : Number(v));

const meta = await readJson(join(RAW, '_meta.json'));
const retrieved = meta.retrieved_at.slice(0, 10);
const src = (path, extra = {}) => ({
  source_url: API + path,
  source_title: 'maplestory.io MCW v1 game data',
  retrieved_at: retrieved,
  game_version_or_date: 'MCW v1',
  verification_status: 'verified',
  ...extra,
});

// ---------- maps ----------
const mapList = await readJson(join(RAW, 'map-list.json'));
const maps = [];
for (const m of mapList) {
  const d = await readJson(join(RAW, 'map', `${m.id}.json`)).catch(() => null);
  if (!ok(d)) continue;
  const counts = new Map();
  for (const s of d.mobs || []) counts.set(s.id, (counts.get(s.id) || 0) + 1);
  maps.push({
    id: Number(d.id),
    name: d.name || m.name,
    street: d.streetName || m.streetName || '',
    region: d.mapMark || '',
    isTown: String(d.isTown) === 'True',
    mobRate: Number(d.mobRate) || 1,
    width: d.vrBounds?.width ?? 0,
    height: d.vrBounds?.height ?? 0,
    spawns: [...counts].map(([mobId, count]) => ({ mobId, count })).sort((a, b) => b.count - a.count),
    portalsTo: [...new Set((d.portals || []).map((p) => p.toMap))].sort((a, b) => a - b),
    npcs: (d.npcs || []).map((n) => n.name).filter(Boolean),
    source: src(`/map/${d.id}`),
  });
}
maps.sort((a, b) => a.id - b.id);

// ---------- monsters ----------
const ELEM = { F: 'fire', I: 'ice', L: 'lightning', S: 'poison', H: 'holy', D: 'dark', P: 'physical' };
const EFFECT = { 1: 'immune', 2: 'resist', 3: 'weak' };
const parseElem = (code = '') => {
  const out = {};
  for (const [, k, v] of code.matchAll(/([FILSHDP])(\d)/g)) if (ELEM[k] && EFFECT[v]) out[ELEM[k]] = EFFECT[v];
  return out;
};
const mobList = await readJson(join(RAW, 'mob-list.json'));
const bossIds = new Set(mobList.filter((m) => m.isBoss).map((m) => m.id));
const monsters = [];
for (const m of mobList) {
  // Tutorial and developer test monsters are not real training targets.
  if (/^Tutorial/i.test(m.name) || /^Test\(/.test(m.name)) continue;
  const d = await readJson(join(RAW, 'mob', `${m.id}.json`)).catch(() => null);
  if (!ok(d) || !d.meta) continue;
  const x = d.meta;
  const spawns = maps
    .flatMap((mp) => mp.spawns.filter((s) => s.mobId === m.id).map((s) => ({ mapId: mp.id, mapName: `${mp.street}: ${mp.name}`, count: s.count })))
    .sort((a, b) => b.count - a.count);
  const elemRaw = x.elementalAttributes || '';
  monsters.push({
    id: m.id,
    name: d.name || m.name,
    level: x.level ?? m.level,
    hp: x.maxHP ?? 0,
    mp: x.maxMP ?? 0,
    exp: x.exp ?? 0,
    pdd: x.physicalDefense ?? 0,
    mdd: x.magicDefense ?? 0,
    accuracy: x.accuracy ?? 0,
    evasion: x.evasion ?? 0,
    elemRaw,
    elements: parseElem(elemRaw),
    undead: !!x.isUndead,
    isBoss: bossIds.has(m.id) || !!x.isBoss,
    spawns,
    source: src(`/mob/${m.id}`, spawns.length ? {} : { notes: 'No spawn points found in any MCW map file (event, PQ-only or not yet released area).' }),
  });
}
monsters.sort((a, b) => a.level - b.level || a.id - b.id);

// ---------- skills ----------
const skillFiles = (await readdir(join(RAW, 'skillbook'))).filter((f) => f.endsWith('.json'));
const skills = [];
const missingJobs = [];
for (const f of skillFiles) {
  const jobId = Number(f.replace('.json', ''));
  const b = await readJson(join(RAW, 'skillbook', f));
  if (!ok(b)) {
    missingJobs.push(jobId);
    continue;
  }
  for (const s of b.skills || []) {
    const name = s.description?.name;
    skills.push({
      id: s.id,
      jobId,
      name: name || `(unnamed ${s.id})`,
      masterLevel: s.masterLevel,
      prereqs: Object.entries(s.requiredSkillLevels || {}).map(([id, lv]) => ({ skillId: Number(id), level: Number(lv) })),
      description: (s.description?.desc || '').replace(/\\n/g, '\n').replace(/#c|#/g, ''),
      hidden: !name,
      levels: (s.levelProperties || []).map((p, i) => ({
        level: i + 1,
        damage: num(p.damage),
        mad: num(p.mad),
        mpCon: num(p.mpCon),
        mobCount: num(p.mobCount),
        attackCount: num(p.attackCount),
        bulletCount: num(p.bulletCount),
        raw: p,
      })),
      source: src(`/job/${jobId}/skillbook`, name ? {} : { notes: 'Hidden skill with no name in the client files.' }),
    });
  }
}
skills.sort((a, b) => a.id - b.id);

// ---------- quests ----------
const questList = await readJson(join(RAW, 'quest-list.json'));
const quests = [];
for (const q of questList) {
  const d = await readJson(join(RAW, 'quest', `${q.id}.json`)).catch(() => null);
  if (!ok(d)) continue;
  const start = d.requirementToStart || {};
  const reward = d.rewardOnComplete || {};
  quests.push({
    id: d.id,
    name: d.name,
    area: d.areaName || '',
    minLevel: start.levelMinimum ?? 0,
    maxLevel: start.levelMaximum,
    exp: reward.exp ?? 0,
    meso: reward.meso ?? 0,
    rewardItemCount: (reward.items || []).filter((i) => i.count > 0).length,
    prereqQuestIds: (start.quests || []).map((x) => x.id),
    npcId: start.npcId,
    repeatable: !!(start.repeatInterval || start.dayByDay || start.interval),
    source: src(`/quest/${d.id}`),
  });
}
quests.sort((a, b) => a.minLevel - b.minLevel || a.id - b.id);

await mkdir(OUT, { recursive: true });
const write = (name, data) => writeFile(join(OUT, name), JSON.stringify(data));
await write('maps.json', maps);
await write('monsters.json', monsters);
await write('skills.json', skills);
await write('quests.json', quests);
await write('meta.json', {
  source: API,
  retrieved_at: meta.retrieved_at,
  built_at: new Date().toISOString(),
  counts: { maps: maps.length, monsters: monsters.length, skills: skills.length, quests: quests.length },
  missing_skillbooks: missingJobs.sort((a, b) => a - b),
});
console.log(`maps ${maps.length}, monsters ${monsters.length} (${monsters.filter((m) => m.spawns.length).length} with spawns), skills ${skills.length}, quests ${quests.length}`);
console.log(`maps with portals: ${maps.filter((m) => m.portalsTo.length).length}; missing skillbooks: ${missingJobs.join(', ') || 'none'}`);
