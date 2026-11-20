// MeowDB (NiaDB) price refresh: the latest usual Free Market price (and its 30-day trend) for the app's items, kept
// on this PC only. Personal use, run by hand.
//
//   npm run prices:fetch -- --contact="you@example.com"                  # Cash Shop + gear-guide items
//   npm run prices:fetch -- --contact="..." --set=cash,gear,scrolls     # also every scroll
//   npm run prices:fetch -- --contact="..." --refresh                   # ignore the cache
//   npm run prices:fetch -- --probe                                      # the original page probe
//
// Rules it keeps (MeowDB's published rules for approved tools, meowdb.com/reuse):
//   - one request every 10 s, never two at once;
//   - its name and your contact in the User-Agent (it won't run without --contact);
//   - the same address for the same question (no cache-busting);
//   - stops for good on HTTP 403 or 429, or anything that looks like a bot check. It never
//     tries to get past a block, a login or a CAPTCHA.
// Results go to data-local/meowdb-prices.json (git-ignored, and not part of the GitHub Pages
// build). Progress is saved after every item, so stopping (Ctrl+C) and running again resumes.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { usualPrice } from '../src/calculators/marketPrice.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://meowdb.com';
const BASE = `${SITE}/msclassic`;
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const flag = (name) => process.argv.includes(`--${name}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (f) => access(f).then(() => true, () => false);
const BOT_CHECK = /just a moment|cf-chl|challenge-platform\/h\/[a-z]\/orchestrate|captcha|verify you are human|attention required/i;

if (flag('probe')) await probe();
else await collect();

// ---------------------------------------------------------------- usual prices

async function collect() {
  const contact = arg('contact');
  if (!contact) {
    console.log('MeowDB asks tools to say who runs them. Add your contact, e.g.\n  npm run prices:fetch -- --contact="you@example.com"');
    process.exit(1);
  }
  const UA = `mcw-companion-price-refresh/0.2 (personal use; ${contact})`;
  const DELAY_MS = 10_000;
  const PRICE_MAX_AGE_DAYS = 3;
  const sets = new Set((arg('set') ?? 'cash,gear').split(','));
  const refresh = flag('refresh');

  const OUT_DIR = join(ROOT, 'data-local');
  const OUT = join(OUT_DIR, 'meowdb-prices.json');
  await mkdir(OUT_DIR, { recursive: true });
  const db = (await exists(OUT)) ? JSON.parse(await readFile(OUT, 'utf8')) : { source: { title: 'NiaDB (MeowDB) Free Market prices', url: `${BASE}/price-check` }, items: {} };
  const save = () => writeFile(OUT, JSON.stringify(db, null, 1));

  // Which items: from the app's own data.
  const items = JSON.parse(await readFile(join(ROOT, 'src/data/generated/items.json'), 'utf8'));
  const gear = JSON.parse(await readFile(join(ROOT, 'src/data/gearGuide.json'), 'utf8'));
  const norm = (s) => s.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const gearNames = new Set(gear.picks.flatMap((p) => p.item.split(/\s*\/\s*/).map(norm)));
  const wanted = items.filter(
    (i) =>
      !i.untradeable &&
      ((sets.has('cash') && i.cash) || (sets.has('gear') && gearNames.has(norm(i.name))) || (sets.has('scrolls') && /Scroll$/.test(i.category ?? ''))),
  );
  console.log(`${wanted.length} items (${[...sets].join(', ')}). One request every 10 s; Ctrl+C stops, running again resumes.`);

  let requests = 0;
  async function get(url) {
    if (requests++) await sleep(DELAY_MS);
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json,text/html' } });
    const body = await res.text();
    if (res.status === 403 || res.status === 429 || BOT_CHECK.test(body.slice(0, 3000)) || /^text\/html/.test(res.headers.get('content-type') ?? '') && url.includes('/api/') ) {
      console.log(`\nStopped: MeowDB answered HTTP ${res.status}${res.status === 200 ? ' with a page instead of data (likely a check)' : ''} for ${url}.`);
      console.log('Nothing was retried or worked around. What was collected so far is saved.');
      await save();
      process.exit(2);
    }
    if (!res.ok) return null;
    return body;
  }
  const fresh = (iso, days) => !refresh && iso && Date.now() - Date.parse(iso) < days * 864e5;

  // 1) MeowDB's own number for each game item, many per request.
  const unknown = wanted.filter((i) => !db.items[i.id]?.meowId);
  for (let k = 0; k < unknown.length; k += 40) {
    const batch = unknown.slice(k, k + 40);
    const body = await get(`${BASE}/api/items?iconKeys=${batch.map((i) => i.id).join(',')}&limit=${batch.length}`);
    for (const m of body ? JSON.parse(body).items ?? [] : []) {
      const gameId = Number(m.iconKey);
      db.items[gameId] = { ...db.items[gameId], meowId: m.id, name: m.name, url: `${BASE}/item-db/${m.id}` };
    }
    console.log(`  looked up ${Math.min(k + 40, unknown.length)}/${unknown.length} item numbers`);
    await save();
  }

  // 2) One request per item: 30 days of daily prices. Kept: the usual price and each day's
  //    median (for the little trend line).
  let n = 0;
  for (const i of wanted) {
    const e = db.items[i.id];
    n++;
    if (!e?.meowId || fresh(e.fetchedAt, PRICE_MAX_AGE_DAYS)) continue;
    const body = await get(`${BASE}/api/item-price-public?itemId=${e.meowId}&condition=clean`);
    if (body) {
      const days = (JSON.parse(body).points ?? []).map((d) => ({ day: d.day, median: d.median, count: d.count }));
      const u = usualPrice(days);
      e.price = u?.price ?? null;
      e.sales = u?.sales ?? 0;
      e.asOf = u?.asOf ?? null;
      e.trend = days.filter((d) => d.count > 0).map((d) => [d.day, d.median]);
      e.fetchedAt = new Date().toISOString();
    }
    db.retrieved_at = new Date().toISOString();
    await save();
    process.stdout.write(`\r  ${n}/${wanted.length} ${i.name.slice(0, 40).padEnd(40)}`);
  }
  console.log(`\nDone: ${Object.values(db.items).filter((e) => e.price).length} items with a usual price in data-local/meowdb-prices.json (${requests} requests).`);
}

// ---------------------------------------------------------------- original probe (kept)

async function probe() {
  const OUT = join(ROOT, 'data-raw', 'meowdb');
  const UA = 'mcw-companion-price-refresh/0.1 (personal use, run by hand)';
  const PROBE = [
    ['price-check', `${BASE}/price-check`],
    ['safe-to-sell', `${BASE}/item-db/safe-to-sell`],
    ['item-db', `${BASE}/item-db`],
    ['item-608-wooden-sword', `${BASE}/item-db/608`],
    ['item-543-long-sword', `${BASE}/item-db/543`],
  ];
  await mkdir(OUT, { recursive: true });
  const log = [];
  let fetched = 0;
  for (const [name, url] of PROBE) {
    if (!flag('refresh') && (await exists(join(OUT, `${name}.html`)))) {
      console.log(`· ${name}: already saved`);
      continue;
    }
    if (fetched++) await sleep(10_000);
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
    const body = await res.text();
    const blocked = res.status === 403 || res.status === 429 || BOT_CHECK.test(body.slice(0, 5000));
    log.push({ name, url, status: res.status, bytes: body.length, blocked, at: new Date().toISOString() });
    if (blocked) {
      console.log(`✗ ${name}: blocked (HTTP ${res.status}). Stopping.`);
      break;
    }
    await writeFile(join(OUT, `${name}.html`), body);
    console.log(`✓ ${name}: HTTP ${res.status}, ${Math.round(body.length / 1024)} KB`);
  }
  if (log.length) await writeFile(join(OUT, '_probe.json'), JSON.stringify(log, null, 1));
}
