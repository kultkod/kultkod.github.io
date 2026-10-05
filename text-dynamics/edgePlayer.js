export function createEdgePlayer({
  data,
  graph,
  els,
  onStateChange
}) {
  const PARA = data.meta?.para ?? "\n\n";

  let mode = "node";               // "node" | "edge"
  let nodeId = data.versions?.[0]?.id ?? null;
  let edgeKey = null;              // "from->to"
  let step = 0;                    // 0..N+1

  let accumulate = false;

  // fully completed edges (for graph coloring)
  let completedEdges = new Set();

  // actual traversed path (for prev/back navigation)
  let edgeHistory = [];

  // ---------------- helpers ----------------

  function currentEdge() {
    if (mode !== "edge") return null;
    return graph.edgesByKey.get(edgeKey) ?? null;
  }

  function maxStepForEdge(e) {
    return (e?.ops?.length ?? 0) + 1;
  }

  function isAtEdgeEnd() {
    const e = currentEdge();
    if (!e) return false;
    return step >= maxStepForEdge(e);
  }

  function getOutgoingAfterCurrentEdge() {
    const e = currentEdge();
    if (!e) return [];
    return graph.outEdges.get(e.to) ?? [];
  }

  // ---------------- accumulate ----------------

  function setAccumulate(value) {
    accumulate = !!value;
    emit();
  }

  // ---------------- navigation ----------------

  function goToNode(id) {
    if (!graph.versionsById.has(id)) return;

    mode = "node";
    nodeId = id;
    edgeKey = null;
    step = 0;

    emit();
  }

  function startEdge(fromId, toId, rememberCurrent = false) {
    const k = graph.key(fromId, toId);
    if (!graph.edgesByKey.has(k)) return;

    const oldEdgeKey = edgeKey;
    const oldEdge = currentEdge();

    // if we are switching from an ended edge, mark it completed & store history
    if (rememberCurrent && oldEdge && isAtEdgeEnd()) {
      completedEdges.add(oldEdgeKey);
      edgeHistory.push(oldEdgeKey);
    }

    mode = "edge";
    nodeId = fromId;
    edgeKey = k;
    step = 0;

    emit();
  }

  function continueToEdge(nextEdge) {
    if (!nextEdge) return;
    if (!isAtEdgeEnd()) return;
    startEdge(nextEdge.from, nextEdge.to, true);
  }

  function next() {
    if (mode === "node") {
      const outs = graph.outEdges.get(nodeId) ?? [];
      if (outs.length === 1) startEdge(outs[0].from, outs[0].to);
      return;
    }

    const e = currentEdge();
    if (!e) return;

    const end = maxStepForEdge(e);

    if (step < end) {
      step++;
      emit();
      return;
    }

    // at end of edge
    const outs = graph.outEdges.get(e.to) ?? [];
    if (outs.length === 1) {
      continueToEdge(outs[0]);
      return;
    }

    emit();
  }

  function prev() {
    if (mode === "node") {
      const ins = graph.inEdges.get(nodeId) ?? [];
      if (!ins.length) return;

      const previous = ins[0];
      const k = graph.key(previous.from, previous.to);

      mode = "edge";
      nodeId = previous.from;
      edgeKey = k;
      step = maxStepForEdge(previous);

      completedEdges.delete(k);
      emit();
      return;
    }

    const e = currentEdge();
    if (!e) return;

    if (step > 0) {
      step--;
      emit();
      return;
    }

    // step === 0: go to previous traversed edge end
    if (edgeHistory.length) {
      const previousKey = edgeHistory.pop();
      const previousEdge = graph.edgesByKey.get(previousKey);
      if (!previousEdge) return;

      completedEdges.delete(previousKey);

      mode = "edge";
      edgeKey = previousKey;
      nodeId = previousEdge.from;
      step = maxStepForEdge(previousEdge);

      emit();
      return;
    }

    // fallback: if unique parent exists, go there
    const ins = graph.inEdges.get(e.from) ?? [];
    if (ins.length === 1) {
      const previous = ins[0];
      const k = graph.key(previous.from, previous.to);

      completedEdges.delete(k);

      mode = "edge";
      edgeKey = k;
      nodeId = previous.from;
      step = maxStepForEdge(previous);

      emit();
    }
  }

  function setStep(value) {
    if (mode !== "edge") return;

    const e = currentEdge();
    if (!e) return;

    const end = maxStepForEdge(e);
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return;

    step = Math.max(0, Math.min(end, n));
    emit();
  }

  // ---------------- UI sync ----------------

  function syncPanels() {
    if (!els.edgeProgress || !els.edgeOptions) return;

    if (mode === "node") {
      const outs = graph.outEdges.get(nodeId) ?? [];
      els.edgeProgress.style.visibility = "hidden";
      els.edgeOptions.style.display = outs.length > 1 ? "block" : "none";
      return;
    }

    els.edgeProgress.style.visibility = "visible";
    els.edgeOptions.style.display = isAtEdgeEnd() ? "block" : "none";
  }

  function escapeHTML(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function syncEdgeOptions() {
    if (!els.edgeOptions) return;

    if (mode === "node") {
      const outs = graph.outEdges.get(nodeId) ?? [];
      if (outs.length <= 1) {
        els.edgeOptions.innerHTML = "";
        els.edgeOptions.style.display = "none";
        return;
      }
      renderOptions(outs, "Куда дальше?", false);
      return;
    }

    if (!isAtEdgeEnd()) {
      els.edgeOptions.innerHTML = "";
      els.edgeOptions.style.display = "none";
      return;
    }

    const outs = getOutgoingAfterCurrentEdge();

    if (outs.length === 0) {
      els.edgeOptions.innerHTML = `<div class="hint">Конец истории текста</div>`;
      els.edgeOptions.style.display = "block";
      return;
    }

    if (outs.length === 1) {
      renderOptions(outs, "Дальше", true);
      return;
    }

    renderOptions(outs, "Куда дальше?", true);
  }

  function renderOptions(edges, hint, continuing) {
    const buttons = edges.map(e => {
      const toV = graph.versionsById.get(e.to);
      if (!toV) return "";

      const tipLines = [
        `${toV.id}`,
        `${toV.title}`,
        toV.date ? `Дата: ${toV.date}` : '',
        toV.note ? `Прим.: ${toV.note}` : ''
      ].filter(Boolean);

      const tip = tipLines.join('\n');
      
      return `
        <button data-from="${escapeHTML(e.from)}" data-to="${escapeHTML(e.to)}">
          <span class="opt-pill" title="${escapeHTML(tip)}">
            <span class="id">${escapeHTML(toV.id)}</span>
            <span class="title">${escapeHTML(toV.title)}</span>
            <span class="date">${escapeHTML(toV.date)}</span>
          </span>
        </button>
      `;
    }).join("");

    els.edgeOptions.innerHTML = `
      <div class="hint">${escapeHTML(hint)}</div>
      <div class="row">${buttons}</div>
    `;

    els.edgeOptions.querySelectorAll("button[data-to]").forEach(btn => {
      btn.onclick = () => {
        const from = btn.getAttribute("data-from");
        const to = btn.getAttribute("data-to");
        const nextEdge = graph.edgesByKey.get(graph.key(from, to));
        if (!nextEdge) return;

        if (continuing) continueToEdge(nextEdge);
        else startEdge(from, to);
      };
    });

    els.edgeOptions.style.display = "block";
  }

  function syncProgress() {
    if (!els.slider || !els.opsFill) return;

    if (mode !== "edge") {
      els.slider.min = 0;
      els.slider.max = 0;
      els.slider.value = 0;
      els.slider.disabled = true;
      els.opsFill.style.width = "0%";
      return;
    }

    const e = currentEdge();
    const maxStep = maxStepForEdge(e);

    els.slider.disabled = false;
    els.slider.min = 0;
    els.slider.max = maxStep;
    els.slider.value = step;

    const ratio = maxStep > 0 ? (step / maxStep) : 0;
    els.opsFill.style.width = `${ratio * 100}%`;
  }

  // ---------------- text state ----------------

  function liveIndex(tokens, logical) {
    let c = 0;
    for (let j = 0; j < tokens.length; j++) {
      if (tokens[j].st !== "del") {
        if (c === logical) return j;
        c++;
      }
    }
    return tokens.length;
  }

  function makeTokenObj(v, st, opIdx) {
    return { v, para: v === PARA, st, op: opIdx };
  }

  function applyOpFlat(tokens, op, opIdx) {
    if (op.d == null && op.v == null) return;

    let cut = liveIndex(tokens, op.i);

    if (op.d) {
      let n = op.d;
      let j = cut;
      while (n > 0 && j < tokens.length) {
        if (tokens[j].st !== "del") {
          tokens[j].st = "del";
          tokens[j].op = opIdx;
          n--;
        }
        j++;
      }
      cut = j;
    }

    if (op.v) {
      const fresh = op.v.map(v => makeTokenObj(v, "ins", opIdx));
      tokens.splice(cut, 0, ...fresh);
    }
  }

  function buildViewState() {
    if (mode === "node") {
      const v = graph.versionsById.get(nodeId);
      return {
        mode,
        nodeId,
        edge: null,
        exact: true,
        versionForCard: v,
        curOp: -1,
        tokens: v.text.map(t => makeTokenObj(t, "ok", -1))
      };
    }

    const e = currentEdge();
    const fromV = graph.versionsById.get(e.from);
    const toV = graph.versionsById.get(e.to);
    const N = e.ops?.length ?? 0;

    if (step === 0) {
      return {
        mode,
        nodeId,
        edge: e,
        exact: true,
        versionForCard: fromV,
        curOp: -1,
        tokens: fromV.text.map(t => makeTokenObj(t, "ok", -1))
      };
    }

    if (step >= N + 1) {
      return {
        mode,
        nodeId: e.to,
        edge: e,
        exact: true,
        versionForCard: toV,
        curOp: -1,
        tokens: toV.text.map(t => makeTokenObj(t, "ok", -1))
      };
    }

    const tokens = fromV.text.map(t => makeTokenObj(t, "ok", -1));
    for (let k = 0; k < step; k++) applyOpFlat(tokens, e.ops[k], k);

    return {
      mode,
      nodeId,
      edge: e,
      exact: false,
      versionForCard: fromV,
      curOp: step - 1,
      tokens
    };
  }

  function getStatusLabel() {
    if (mode === "node") {
      return { text: "текст версии целиком", cls: "status rest", step: "версия" };
    }

    const e = currentEdge();
    const N = e.ops?.length ?? 0;
    const max = N + 1;

    if (step === 0) {
      return { text: "исходная версия", cls: "status rest", step: `шаг 0 / ${max}` };
    }

    if (step >= max) {
      return { text: "конечная версия", cls: "status rest", step: `шаг ${max} / ${max}` };
    }

    return { text: `правка ${step} из ${N}`, cls: "status moving", step: `шаг ${step} / ${max}` };
  }

  function getTransitionLabel() {
    if (mode === "node") {
      const v = graph.versionsById.get(nodeId);
      return `${v.id} ${v.title}`;
    }

    const e = currentEdge();
    const a = graph.versionsById.get(e.from);
    const b = graph.versionsById.get(e.to);
    return `${a.id} ${a.title} → ${b.id} ${b.title}`;
  }

  function getComment() {
    // атомарные комментарии сейчас не показываем
    return null;
  }

  // ---------------- path helpers ----------------

  function computePathToNode(targetId) {
    const seen = new Set();
    const path = [];
    let cur = targetId;

    while (!seen.has(cur)) {
      seen.add(cur);
      const ins = graph.inEdges.get(cur) ?? [];
      if (!ins.length) break;
      const e = ins[0];
      path.push(graph.key(e.from, e.to));
      cur = e.from;
    }

    path.reverse();
    return path;
  }

  function setPathToNode(targetId) {
    const path = computePathToNode(targetId);
    completedEdges = new Set(path);
    edgeHistory = [...path];
    emit();
  }

  // Главное: прыжок в выбранный узел как "конец последнего ребра" (100%)
  function jumpToNodeAtEnd(targetId) {
    if (!graph.versionsById.has(targetId)) return;

    const path = computePathToNode(targetId);

    if (!path.length) {
      goToNode(targetId);
      return;
    }

    const lastKey = path[path.length - 1];
    const lastEdge = graph.edgesByKey.get(lastKey);
    if (!lastEdge) {
      goToNode(targetId);
      return;
    }

    // done edges = все до последнего
    const done = path.slice(0, -1);
    completedEdges = new Set(done);
    edgeHistory = [...done];

    mode = "edge";
    nodeId = lastEdge.from;
    edgeKey = lastKey;
    step = maxStepForEdge(lastEdge); // 100%

    emit();
  }

  // ---------------- render cycle ----------------

  function emit() {
    syncPanels();
    syncEdgeOptions();
    syncProgress();
    onStateChange?.(getPublicState());
  }

  function getPublicState() {
    return {
      mode,
      nodeId,
      edgeKey,
      step,

      accumulate,
      completedEdges,

      currentEdge: currentEdge(),

      buildViewState,
      getStatusLabel,
      getTransitionLabel,
      getComment
    };
  }

  // init: autostart first edge if single outgoing
  (function init() {
    if (!nodeId) { emit(); return; }
    const outs = graph.outEdges.get(nodeId) ?? [];
    if (outs.length === 1) {
      startEdge(outs[0].from, outs[0].to, false);
      return;
    }
    emit();
  })();

  return {
    getState: getPublicState,

    goToNode,
    startEdge,

    prev,
    next,

    setStep,
    setAccumulate,

    setPathToNode,
    jumpToNodeAtEnd
  };
}