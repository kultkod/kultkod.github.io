export function buildGraphIndex(data) {
  const versionsById = new Map();
  const orderIndex = new Map();

  (data.versions ?? []).forEach((v, idx) => {
    versionsById.set(v.id, v);
    orderIndex.set(v.id, idx);
  });

  const edges = (data.edges ?? []).filter(e => versionsById.has(e.from) && versionsById.has(e.to));

  const outEdges = new Map(); // fromId -> [edge]
  const inEdges = new Map();  // toId -> [edge]
  const edgesByKey = new Map();

  const key = (a, b) => `${a}->${b}`;

  for (const e of edges) {
    const k = key(e.from, e.to);
    edgesByKey.set(k, e);

    if (!outEdges.has(e.from)) outEdges.set(e.from, []);
    outEdges.get(e.from).push(e);

    if (!inEdges.has(e.to)) inEdges.set(e.to, []);
    inEdges.get(e.to).push(e);
  }

  // deterministic ordering (by versions[] order)
  const byTo = (a, b) => (orderIndex.get(a.to) ?? 0) - (orderIndex.get(b.to) ?? 0);
  const byFrom = (a, b) => (orderIndex.get(a.from) ?? 0) - (orderIndex.get(b.from) ?? 0);

  outEdges.forEach(arr => arr.sort(byTo));
  inEdges.forEach(arr => arr.sort(byFrom));

  return {
    versionsById,
    orderIndex,
    edges,
    outEdges,
    inEdges,
    edgesByKey,
    key
  };
}