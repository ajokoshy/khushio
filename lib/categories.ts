/** True if making `parentId` the parent of `id` would create a cycle (or a category its own parent). */
export function parentCreatesCycle(cats: { id: string; parentId: string | null }[], id: string, parentId: string | null): boolean {
  if (!parentId) return false;
  const parent = new Map(cats.map((c) => [c.id, c.parentId] as const));
  let cur: string | null | undefined = parentId, hops = 0;
  while (cur && hops++ < 50) { if (cur === id) return true; cur = parent.get(cur); }
  return hops >= 50;
}
