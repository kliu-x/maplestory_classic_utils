import { IMG, QUESTS, itemById, mapById, monsterById, npcById } from '../data';
import { whereOnMap } from '../calculators/route';
import { href } from '../router';
import { MapView } from './MapView';

// The 2nd job test, built from each class's quest chain in the game files. The instructor's
// spot is often far from where you walk in, so the guide says where on the map to look.

const CHAINS: Record<string, { first: number; testMap: number }> = {
  Warrior: { first: 20000, testMap: 80001300 },
  Magician: { first: 20100, testMap: 80001100 },
  Bowman: { first: 20200, testMap: 80001000 },
  Thief: { first: 20300, testMap: 80001200 },
};

export function SecondJobGuide({ family }: { family: string }) {
  const chain = CHAINS[family];
  if (!chain) return null;
  const quest = (step: number) => QUESTS.find((q) => q.id === chain.first + step);
  const master = npcById.get(quest(0)?.npcId ?? -1);
  const instructor = npcById.get(quest(2)?.npcId ?? -1);
  const masterMap = mapById.get(master?.mapIds[0] ?? -1);
  const map = mapById.get(instructor?.mapIds[0] ?? -1);
  const spot = map?.npcs.find((n) => n.id === instructor?.id);
  const test = mapById.get(chain.testMap);
  const marbles = quest(2)?.collectItems[0];
  if (!master || !instructor || !masterMap || !map || !spot || !test || !marbles) return null;
  const mobs = [...new Set(test.spawns.map((s) => s.mobId))];
  const where = whereOnMap(map, spot.x, spot.y);
  const step = (n: number, label: string) => <a href={href('quests', { id: chain.first + n })}>{label}</a>;

  return (
    <div className="card">
      <div className="card-head"><h2>Your 2nd job</h2></div>
      <ol className="job-steps">
        <li>{step(0, 'Talk to')} <strong>{master.name}</strong> in {masterMap.name}. You get a letter.</li>
        <li>
          {step(1, 'Take the letter to')} the <strong>{instructor.name}</strong> in <a href={href('maps', { id: map.id })}>{map.name}</a>.
          {where && <> <strong className="job-where">{where}</strong></>}
        </li>
        <li>
          {step(2, 'The instructor sends you to')} {test.name}. Collect <strong>{marbles.count} {itemById.get(marbles.itemId)?.name}s</strong> from{' '}
          <span className="job-mobs">{mobs.map((id) => <img key={id} src={IMG.mob(id)} alt="" loading="lazy" />)}</span>
          {mobs.map((id) => monsterById.get(id)?.name).join(' and ')}.
        </li>
        <li>{step(3, 'Hand them in')} for The Proof of a Hero, then bring it back to <strong>{master.name}</strong> and pick your job.</li>
      </ol>
      <MapView map={map} pins={[{ x: spot.x, y: spot.y, label: instructor.name, kind: 'spot' }]} />
    </div>
  );
}
