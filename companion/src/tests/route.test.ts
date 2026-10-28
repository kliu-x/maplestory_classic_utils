import { describe, expect, it } from 'vitest';
import { MAPS, QUESTS, mapById, npcById } from '../data';
import { homeTown, minimapPoint, routeFromTown } from '../calculators/route';
import { QUEST_NOTES } from '../data/questNotes';

describe('getting around', () => {
  it('routes from the nearest town through portals', () => {
    const henesys = MAPS.find((m) => m.name === 'Henesys')!;
    expect(routeFromTown(MAPS, henesys.id)).toEqual([henesys.id]);
    const routed = MAPS.map((m) => routeFromTown(MAPS, m.id)).filter((p): p is number[] => !!p && p.length > 2);
    expect(routed.length).toBeGreaterThan(5); // the files list few portals; most maps fall back to the home town
    for (const path of routed) {
      expect(mapById.get(path[0])!.isTown).toBe(true);
      // every hop is a portal in one direction or the other
      for (let i = 1; i < path.length; i++) {
        const a = mapById.get(path[i - 1])!, b = mapById.get(path[i])!;
        expect(a.portalsTo.includes(b.id) || b.portalsTo.includes(a.id)).toBe(true);
      }
    }
  });

  it('knows the home town even where portals are missing from the files', () => {
    const park = MAPS.find((m) => m.name === 'Ant Tunnel Park')!;
    expect(mapById.get(homeTown(MAPS, park.id)!)!.isTown).toBe(true);
    // Safe zones flagged as towns (Marr's Forest) are not route starting points.
    const marr = MAPS.find((m) => m.name === "Marr's Forest")!;
    expect(homeTown(MAPS, marr.id)).not.toBe(marr.id);
  });

  it('places NPCs on the minimap (image = map / 2^magnification)', () => {
    const henesys = MAPS.find((m) => m.name === 'Henesys')!;
    const bruce = henesys.npcs.find((n) => n.name === 'Bruce')!;
    const p = minimapPoint(henesys, bruce.x, bruce.y)!;
    expect(Math.round(p.width)).toBe(431);
    expect(p.left).toBeGreaterThan(0);
    expect(p.left).toBeLessThan(p.width);
    expect(p.top).toBeGreaterThan(0);
    expect(p.top).toBeLessThan(p.height);
  });
});

describe('Mark of the Beta chain', () => {
  const chain = [600004, 600005, 600006, 600007, 600008, 600009, 600010].map((id) => QUESTS.find((q) => q.id === id)!);

  it('is linked in order, given by Jay in Henesys', () => {
    chain.slice(1).forEach((q, i) => expect(q.prereqQuestIds).toContain(chain[i].id));
    const jay = npcById.get(chain[0].npcId!)!;
    expect(jay.name).toBe('Jay');
    expect(mapById.get(jay.mapIds[0])!.name).toBe('Henesys');
    expect(npcById.get(chain[4].endNpcId!)!.name).toBe('Mong from Kong');
    expect(chain[3].hint).toMatch(/ancient woods/);
  });

  it('community locations point at real maps and keep their sources', () => {
    for (const [id, note] of Object.entries(QUEST_NOTES)) {
      expect(QUESTS.some((q) => q.id === Number(id))).toBe(true);
      if (note.mapId) expect(mapById.has(note.mapId)).toBe(true);
      expect(note.sources.length).toBeGreaterThan(0);
    }
    expect(mapById.get(QUEST_NOTES[600007].mapId!)!.name).toBe("Marr's Forest");
    expect(QUEST_NOTES[600007].sources.every((s) => s.verification_status === 'conflicting')).toBe(true);
  });
});

describe('quest search', () => {
  it('finds a quest by the item, NPC or monster in it', async () => {
    const { questSearchText } = await import('../data');
    const hits = (t: string) => QUESTS.filter((q) => questSearchText(q).includes(t)).map((q) => q.name);
    expect(hits('stuffed drake')).toContain("Transporting Drake's Skull");
    expect(hits('betty')).toContain('Research on Plant Fossils');
    // by the storyline title the in-game quest log shows
    expect(hits('legend of the snail')).toContain('A rainbow snail shell that makes wishes come true!?');
    expect(hits("dr. betty's research")).toContain('Research on Plant Fossils');
  });
});

describe('quest log text', () => {
  it('names the map and boss the requirements leave out (Rainbow Snail -> Mano)', () => {
    const q = QUESTS.find((x) => x.id === 10130)!;
    expect(q.log).toMatch(/Thicket Around the Beach III.*Mano/);
    expect(q.log).not.toMatch(/#/);
    const thicket = mapById.get(q.mentionsMaps[0])!;
    expect(thicket.name).toBe('Thicket Around the Beach III');
    expect(thicket.bossSpawns?.map((b) => b.mobId)).toContain(q.mentionsMobs[0]);
  });
});
