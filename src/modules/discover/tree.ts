/**
 * Pure helpers for the category tree: no database, no framework. The tree is stored as a flat list
 * (id + parentId), so ordering, indentation and "can I move X under Y?" are computed here.
 */
export type TreeNodeBase = { id: string; parentId: string | null; name: string; sortOrder: number };
export type FlatNode<T extends TreeNodeBase> = T & { depth: number; path: string };

const PATH_SEPARATOR = " › ";

/** Siblings sort by sort_order, then name (case-insensitive), then id so the order is always the same. */
function compareSiblings(a: TreeNodeBase, b: TreeNodeBase): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id);
}

function childrenByParent<T extends TreeNodeBase>(rows: readonly T[]): Map<string | null, T[]> {
  const ids = new Set(rows.map((r) => r.id));
  const map = new Map<string | null, T[]>();
  for (const row of rows) {
    // A parent that does not exist (bad data) is treated as "no parent" so the row is still reachable.
    const key = row.parentId !== null && ids.has(row.parentId) ? row.parentId : null;
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  for (const list of map.values()) list.sort(compareSiblings);
  return map;
}

/**
 * Depth-first order with depth and a "Parent › Child" path. Rows that sit in a cycle (only possible with
 * bad data, the service prevents it) are appended as top-level rows instead of vanishing from the list.
 */
export function flattenTree<T extends TreeNodeBase>(rows: readonly T[]): FlatNode<T>[] {
  const children = childrenByParent(rows);
  const out: FlatNode<T>[] = [];
  const seen = new Set<string>();

  const walk = (node: T, depth: number, parentPath: string) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    const path = parentPath ? `${parentPath}${PATH_SEPARATOR}${node.name}` : node.name;
    out.push({ ...node, depth, path });
    for (const child of children.get(node.id) ?? []) walk(child, depth + 1, path);
  };

  for (const root of children.get(null) ?? []) walk(root, 0, "");
  for (const row of [...rows].sort(compareSiblings)) if (!seen.has(row.id)) walk(row, 0, "");
  return out;
}

/** Every category below `id` (children, grandchildren, ...), not including `id` itself. */
export function descendantIds(rows: readonly TreeNodeBase[], id: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const row of rows) {
    if (row.parentId === null) continue;
    const list = children.get(row.parentId);
    if (list) list.push(row.id);
    else children.set(row.parentId, [row.id]);
  }
  const out = new Set<string>();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length > 0) {
    const next = stack.pop() as string;
    if (out.has(next) || next === id) continue;
    out.add(next);
    stack.push(...(children.get(next) ?? []));
  }
  return out;
}

/** True if giving `id` the parent `newParentId` would make a category its own ancestor. */
export function wouldCreateCycle(rows: readonly TreeNodeBase[], id: string, newParentId: string | null): boolean {
  if (newParentId === null) return false;
  return newParentId === id || descendantIds(rows, id).has(newParentId);
}

/** Indents a name for a <select>: "Fashion", "— Shoes", "— — Running shoes". */
export function indentedLabel(name: string, depth: number): string {
  return depth > 0 ? `${"— ".repeat(depth)}${name}` : name;
}

/** The chain from the top-level category down to the parent of `id` (empty for a top-level category). Stops on a cycle. */
export function ancestorsOf<T extends TreeNodeBase>(rows: readonly T[], id: string): T[] {
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const chain: T[] = [];
  const seen = new Set<string>([id]);
  let current = byId.get(id)?.parentId ?? null;
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    const node = byId.get(current);
    if (!node) break;
    chain.unshift(node);
    current = node.parentId;
  }
  return chain;
}
