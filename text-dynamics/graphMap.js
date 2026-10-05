export function createGraphMap({
  data,
  graph,
  els,
  onNodeClick
}) {
  const svg = els.graphSvg;
  const nodesBox = els.graphNodes;

  let pos = null; // versionId -> {x,y}

  function cssSafe(s) {
    return String(s).replaceAll(/[^a-zA-Z0-9_-]/g, '_');
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function assignLanes(ids) {
    const lane = {};
    let nextLane = 0;

    const indeg = new Map(ids.map(id => [id, 0]));
    for (const e of (graph.edges ?? [])) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);

    const roots = ids.filter(id => (indeg.get(id) ?? 0) === 0);

    function walk(id) {
      const outs = graph.outEdges.get(id) ?? [];
      outs.forEach((e, k) => {
        if (lane[e.to] != null) return;
        lane[e.to] = (k === 0) ? lane[id] : nextLane++;
        walk(e.to);
      });
    }

    roots.forEach(r => {
      if (lane[r] == null) lane[r] = nextLane++;
      walk(r);
    });

    ids.forEach(id => { if (lane[id] == null) lane[id] = nextLane++; });

    return lane;
  }

  function build() {
    const ids = (data.versions ?? []).map(v => v.id);
    const lane = assignLanes(ids);
    const maxLane = Math.max(...Object.values(lane));

    const laneGap = 34;
    const padX = 24;
    const padY = 28;

    const W = 1000;
    const H = padY * 2 + (maxLane + 1) * laneGap;

    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = '';
    nodesBox.innerHTML = '';

    pos = {};
    const denom = Math.max(1, ids.length - 1);

    // nodes (text only)
    ids.forEach((id, i) => {
      const x = padX + (i / denom) * (W - padX * 2);
      const y = padY + lane[id] * laneGap;
      pos[id] = { x, y };

      const v = graph.versionsById.get(id);

      const node = document.createElement('div');
      node.className = 'g-node';
      node.id = 'gn-' + id;
      node.style.left = `${(x / W) * 100}%`;
      node.style.top = `${(y / H) * 100}%`;

      const tipLines = [
        `${v.id}`,
        `${v.title}`,
        v.date ? `Дата: ${v.date}` : '',
        v.note ? `Прим.: ${v.note}` : ''
      ].filter(Boolean);

      node.title = tipLines.join('\n');

      node.innerHTML = `<div class="g-label">${escapeHTML(id)}</div>`;

      node.onclick = () => onNodeClick?.(id);
      nodesBox.appendChild(node);
    });

    // edges: base + progress overlay (straight)
    for (const e of (graph.edges ?? [])) {
      const a = pos[e.from];
      const b = pos[e.to];
      if (!a || !b) continue;

      const k = graph.key(e.from, e.to);

      const base = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      base.setAttribute('x1', a.x);
      base.setAttribute('y1', a.y);
      base.setAttribute('x2', b.x);
      base.setAttribute('y2', b.y);
      base.setAttribute('stroke', '#d3d3d3');
      base.setAttribute('stroke-width', '2');
      base.setAttribute('stroke-linecap', 'butt');
      svg.appendChild(base);

      const prog = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      prog.setAttribute('id', 'ge-' + cssSafe(k));
      prog.setAttribute('x1', a.x);
      prog.setAttribute('y1', a.y);
      prog.setAttribute('x2', a.x);
      prog.setAttribute('y2', a.y);
      prog.setAttribute('stroke', '#111');
      prog.setAttribute('stroke-width', '3');
      prog.setAttribute('stroke-linecap', 'butt');
      svg.appendChild(prog);
    }
  }

  function update(playerState) {
    if (!pos) return;

    // reset node classes
    nodesBox.querySelectorAll('.g-node').forEach(n => {
      n.classList.remove('done', 'current', 'target');
    });

    // edge progress
    for (const e of (graph.edges ?? [])) {
      const k = graph.key(e.from, e.to);
      const el = document.getElementById('ge-' + cssSafe(k));
      if (!el) continue;

      const a = pos[e.from];
      const b = pos[e.to];
      if (!a || !b) continue;

      let r = 0;

      if (playerState.completedEdges?.has(k)) {
        r = 1;
      } else if (playerState.mode === 'edge' && playerState.edgeKey === k) {
        const N = (e.ops ?? []).length;
        const max = N + 1;
        r = max > 0 ? (playerState.step / max) : 0;
      }

      r = Math.max(0, Math.min(1, r));

      el.setAttribute('x1', a.x);
      el.setAttribute('y1', a.y);
      el.setAttribute('x2', a.x + (b.x - a.x) * r);
      el.setAttribute('y2', a.y + (b.y - a.y) * r);
    }

    // done nodes from completed edges
    for (const k of (playerState.completedEdges ?? [])) {
      const edge = graph.edgesByKey.get(k);
      if (!edge) continue;
      document.getElementById('gn-' + edge.from)?.classList.add('done');
      document.getElementById('gn-' + edge.to)?.classList.add('done');
    }

    // current/target
    if (playerState.mode === 'node') {
      document.getElementById('gn-' + playerState.nodeId)?.classList.add('current');
      return;
    }

    const e = playerState.currentEdge;
    if (!e) return;

    document.getElementById('gn-' + e.from)?.classList.add('current');

    const N = (e.ops ?? []).length;
    const end = N + 1;

    if (playerState.step >= end) {
      document.getElementById('gn-' + e.to)?.classList.add('current');
    } else {
      document.getElementById('gn-' + e.to)?.classList.add('target');
    }
  }

  build();
  return { update };
}