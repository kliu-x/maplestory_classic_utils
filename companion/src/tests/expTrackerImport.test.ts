import { describe, expect, it } from 'vitest';
import { localStampToIso, mergeOffers, mergeSessions, parseCsv, parseTrackerFile } from '../integrations/expTrackerImport';
import { matchOfferItem, shortMesos, summarizeAsks } from '../calculators/chatPrices';

const MAPS = [
  { id: 1, name: 'Ant Tunnel I', street: 'Dungeon' },
  { id: 2, name: 'Line 1 <Area 1>', street: 'Kerning City Subway' },
];

// Shapes copied from what the tracker writes (exp_tracker.SessionLog / market.MarketLog).
const SESSION_JSON = JSON.stringify([
  { id: '2026-11-09 18:04:12', map: 'Ant Tunnel I', level_start: 36, level_end: 37, seconds: 1800, exp: 90000, exp_per_hr: 180000, pct_per_hr: 92.4, levelups: 1, mesos: 12000, mesos_per_hr: 24000 },
  { id: '2026-11-09 19:00:00', map: '', level_start: 37, level_end: 37, seconds: 600, exp: 10000, exp_per_hr: 60000, pct_per_hr: 5, levelups: 0, mesos: null, mesos_per_hr: null },
  { id: 'not a date', seconds: 60, exp: 1, level_start: 1 },
]);

const SESSION_CSV =
  '﻿started,map,level_start,level_end,minutes,exp_gained,exp_per_hr,pct_per_hr,levelups,mesos_gained,mesos_per_hr\r\n' +
  '2026-11-09 18:04:12,Ant Tunnel I,36,37,30.0,90000,180000,92.4,1,12000,24000\r\n';

const MARKET_JSON = JSON.stringify([
  { id: '2026-11-09 18:10:00', ts: 1, last_ts: 2, last: '18:15:30', count: 3, name: 'Yossi', side: 'S', item: 'Lvl 50 crossbow', watched: true, item_text: 'Crossbow lv50', price: 2500000, price_text: '2.5m', pmo: false, each: false, raw: 'S> Crossbow lv50 2.5m' },
  { id: '2026-11-09 18:11:00', count: 1, name: 'Bob', side: 'S', item: 'Steel Tiara', price: null, pmo: true, each: false, raw: 'S>[Steel Tiara] PMO' },
  { id: '2026-11-09 18:12:00', count: 1, name: 'Amy', side: 'B', item: 'Steel Tiara', price: 300000, pmo: false, each: false, raw: 'B> steel tiara 300k' },
]);

const MARKET_CSV =
  '﻿First seen,Last seen,Times seen,Side,Player,Item,Price,Price (number),PMO,Each,Message\r\n' +
  '2026-11-09 18:10:00,18:15:30,3,SELL,Yossi,Lvl 50 crossbow,2.5m,2500000,,,"S> Crossbow lv50, 2.5m"\r\n' +
  "2026-11-09 18:20:00,18:20:00,1,BUY,'=Evil,Steel Tiara,PMO,,yes,,B> tiara pmo\r\n";

describe('Maple EXP Tracker import', () => {
  it('reads the session log file and links the map', () => {
    const r = parseTrackerFile(SESSION_JSON, MAPS);
    expect(r.kind).toBe('sessions');
    expect(r.sessions).toHaveLength(2);
    expect(r.skipped).toBe(1);
    const s = r.sessions[0];
    expect(s.id).toBe('maple-exp-tracker:2026-11-09 18:04:12');
    expect(s.mapId).toBe(1);
    expect(s.level).toBe(36);
    expect(s.minutes).toBe(30);
    expect(s.expPerActiveMin).toBe(3000);
    expect(s.mesosPerHour).toBe(24000);
    expect(s.source).toBe('maple-exp-tracker');
    expect(r.sessions[1].mapId).toBeNull();
    expect(r.sessions[1].mesosGained).toBeNull();
  });

  it('reads the session CSV export the same way', () => {
    const r = parseTrackerFile(SESSION_CSV, MAPS);
    expect(r.kind).toBe('sessions');
    expect(r.sessions[0]).toMatchObject({ id: 'maple-exp-tracker:2026-11-09 18:04:12', mapId: 1, expGained: 90000, minutes: 30, mesosGained: 12000 });
  });

  it('reads the market log file', () => {
    const r = parseTrackerFile(MARKET_JSON, MAPS);
    expect(r.kind).toBe('offers');
    expect(r.offers).toHaveLength(3);
    expect(r.offers[0]).toMatchObject({ side: 'S', player: 'Yossi', item: 'Lvl 50 crossbow', price: 2500000, count: 3, lastSeen: '2026-11-09 18:15:30' });
    expect(r.offers[1]).toMatchObject({ price: null, pmo: true });
  });

  it('reads the market CSV export, undoing the spreadsheet guard', () => {
    const r = parseTrackerFile(MARKET_CSV, MAPS);
    expect(r.kind).toBe('offers');
    expect(r.offers[0]).toMatchObject({ side: 'S', price: 2500000, count: 3, raw: 'S> Crossbow lv50, 2.5m' });
    expect(r.offers[1]).toMatchObject({ side: 'B', player: '=Evil', price: null, pmo: true });
  });

  it('ignores other files', () => {
    expect(parseTrackerFile('{"a":1}', MAPS).kind).toBe('unknown');
    expect(parseTrackerFile('hello,world\n1,2', MAPS).kind).toBe('unknown');
    expect(parseTrackerFile('[not json', MAPS).kind).toBe('unknown');
  });

  it('merges without duplicates', () => {
    const a = parseTrackerFile(SESSION_JSON, MAPS).sessions;
    expect(mergeSessions(a, a).added).toBe(0);
    expect(mergeSessions([], a).added).toBe(2);
    const o = parseTrackerFile(MARKET_JSON, MAPS).offers;
    const again = o.map((x) => ({ ...x, count: x.count + 1 }));
    const m = mergeOffers(o, again);
    expect(m.added).toBe(0);
    expect(m.offers[0].count).toBe(4);
  });

  it('parses CSV quoting and local time stamps', () => {
    expect(parseCsv('a,"b, c","d ""e"""\n1,2,3')).toEqual([['a', 'b, c', 'd "e"'], ['1', '2', '3']]);
    expect(localStampToIso('2026-11-09 18:04:12')).toBe(new Date(2026, 10, 9, 18, 4, 12).toISOString());
    expect(localStampToIso('yesterday')).toBeNull();
  });
});

describe('chat asking prices', () => {
  const items = [
    { id: 1, name: 'Steel Tiara' },
    { id: 2, name: 'Crossbow', reqLevel: 10 },
    { id: 5, name: 'Mountain Crossbow', reqLevel: 50 },
    { id: 3, name: 'Hat' },
    { id: 4, name: 'Dark Crossbow' },
  ];
  it('ties an offer to the longest whole item name in it, or to nothing', () => {
    expect(matchOfferItem('[Steel Tiara] PMO', items)?.id).toBe(1);
    expect(matchOfferItem('dark crossbow 60 atk', items)?.id).toBe(4);
    expect(matchOfferItem('lvl 50 crossbow', items)).toBeNull(); // the plain Crossbow is Lv 10
    expect(matchOfferItem('lv10 crossbow', items)?.id).toBe(2);
    expect(matchOfferItem('crossbow', items)?.id).toBe(2);
    expect(matchOfferItem('hat', items)).toBeNull(); // too short to trust
    expect(matchOfferItem('crossbows', items)).toBeNull(); // not a whole word
  });
  it('summarises asks and bids separately', () => {
    const offers = parseTrackerFile(MARKET_JSON, MAPS).offers;
    const tiara = summarizeAsks(offers.filter((o) => o.item === 'Steel Tiara'));
    expect(tiara).toMatchObject({ sells: 1, buys: 1, sellLow: null, buyHigh: 300000, pmo: 1, players: 2, lastSeen: '2026-11-09 18:12:00' });
    expect(shortMesos(2500000)).toBe('2.5m');
    expect(shortMesos(300000)).toBe('300k');
  });
});
