// Step numbers for quest chains: a quest's step is how deep it sits behind its prerequisites
// (1 = no prerequisite), and the chain is every quest linked to it by prerequisites.

export interface ChainQuest {
  id: number;
  prereqQuestIds: number[];
}

export interface ChainStep {
  step: number;
  /** Steps in the whole chain (its deepest quest). */
  of: number;
  /** Every quest in the chain, in step order. */
  chain: number[];
}

export function questSteps(quests: ChainQuest[]): Map<number, ChainStep> {
  const by = new Map(quests.map((q) => [q.id, q]));
  const children = new Map<number, number[]>();
  for (const q of quests) for (const p of q.prereqQuestIds) if (by.has(p)) children.set(p, [...(children.get(p) ?? []), q.id]);

  const depth = new Map<number, number>();
  const depthOf = (id: number, seen = new Set<number>()): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (seen.has(id)) return 1; // a loop in the data: stop here
    seen.add(id);
    const ps = by.get(id)!.prereqQuestIds.filter((p) => by.has(p));
    const d = ps.length ? 1 + Math.max(...ps.map((p) => depthOf(p, seen))) : 1;
    depth.set(id, d);
    return d;
  };

  const out = new Map<number, ChainStep>();
  for (const q of quests) {
    if (out.has(q.id)) continue;
    // Everything connected to this quest, either direction.
    const group = new Set<number>([q.id]);
    const todo = [q.id];
    while (todo.length) {
      const id = todo.pop()!;
      for (const n of [...by.get(id)!.prereqQuestIds.filter((p) => by.has(p)), ...(children.get(id) ?? [])]) if (!group.has(n)) (group.add(n), todo.push(n));
    }
    if (group.size < 2) continue;
    const chain = [...group].sort((a, b) => depthOf(a) - depthOf(b) || a - b);
    const of = Math.max(...chain.map((id) => depthOf(id)));
    for (const id of chain) out.set(id, { step: depthOf(id), of, chain });
  }
  return out;
}
