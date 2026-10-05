import { buildGraphIndex } from './tdjGraph.js';
import { createGraphMap } from './graphMap.js';
import { createEdgePlayer } from './edgePlayer.js';

const NOSP = new Set([...'.,!?;:)»”“…>']);
const OPEN = new Set([...'(\u00ab„<']);

function needSpace(prevChar, tok) {
  if (!prevChar) return false;
  if (tok.startsWith('...')) return false;
  if (NOSP.has(tok[0])) return false;
  if (OPEN.has(prevChar)) return false;
  return true;
}

function flushParagraph(box, pEl) {
  if (pEl && pEl.childNodes.length) box.appendChild(pEl);
}

function paragraphIndexForOp(tokens, curOp) {
  if (curOp == null || curOp < 0) return null;
  let p = 0;
  for (const t of tokens) {
    if (t.para) { p++; continue; }
    if (t.op === curOp) return p;
  }
  return null;
}

function drawText(tokens, exact, curOp, settings) {
  const box = document.getElementById('text');
  box.innerHTML = '';

  const mode = settings.highlightMode; // 'doc' | 'para' | 'off'
  const pTarget = (mode === 'para' && !exact) ? paragraphIndexForOp(tokens, curOp) : null;

  function isActive(tok, pIdx) {
    if (exact) return false;
    if (tok.op === -1) return false;
    if (mode === 'off') return false;

    const within = tok.op <= curOp; // накопительная подсветка
    if (mode === 'doc') return within;
    if (mode === 'para') return within && (pTarget == null || pIdx === pTarget);
    return false;
  }

  let pEl = document.createElement('p');
  pEl.className = 'paragraph';
  let prevChar = '';
  let pIdx = 0;

  for (const tok of tokens) {
    if (tok.para) {
      flushParagraph(box, pEl);
      pEl = document.createElement('p');
      pEl.className = 'paragraph';
      prevChar = '';
      pIdx++;
      continue;
    }

    const active = isActive(tok, pIdx);

    // старые deletions скрываем если не активны
    if (tok.st === 'del' && !active) continue;

    if (needSpace(prevChar, tok.v)) pEl.appendChild(document.createTextNode(' '));

    const span = document.createElement('span');
    span.textContent = tok.v;

    const focusAllowed = (mode !== 'off') && !exact;

    span.className =
      'token'
      + (active && tok.st === 'ins' ? ' ins' : '')
      + (active && tok.st === 'del' ? ' del' : '')
      + (focusAllowed && tok.op === curOp ? ' focus' : '');

    pEl.appendChild(span);
    prevChar = tok.v[tok.v.length - 1];
  }

  flushParagraph(box, pEl);
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderEdgeLabel(el, v) {
  if (!el) return;

  if (!v) {
    el.innerHTML = '';
    el.style.visibility = 'hidden';
    el.removeAttribute('title');
    return;
  }

  const tipLines = [
    `${v.id}`,
    `${v.title}`,
    v.date ? `Дата: ${v.date}` : '',
    v.note ? `Прим.: ${v.note}` : ''
  ].filter(Boolean);

  const tip = tipLines.join('\n');


  el.style.visibility = 'visible';
  el.innerHTML = `
    <span class="edge-pill" title="${escapeHTML(tip)}">
      <span class="id">${escapeHTML(v.id)}</span>
      <span class="edge-pill-text">
        ${escapeHTML(v.title)}${v.date ? ` · ${escapeHTML(v.date)}` : ''}
      </span>
    </span>
  `;
}

function setupInstantTooltip() {
  const tip = document.createElement('div');
  tip.id = 'uiTooltip';
  tip.className = 'ui-tooltip';
  document.body.appendChild(tip);

  let activeEl = null;
  let savedTitle = '';

  function place(x, y) {
    const pad = 12;
    const rect = tip.getBoundingClientRect();
    const w = rect.width || 240;
    const h = rect.height || 40;

    let left = x + pad;
    let top = y + pad;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (left + w + 8 > vw) left = Math.max(8, x - w - pad);
    if (top + h + 8 > vh) top = Math.max(8, y - h - pad);

    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function show(text, x, y) {
    tip.textContent = text;
    tip.classList.add('on');
    place(x, y);
  }

  function hide() {
    tip.classList.remove('on');
    if (activeEl) activeEl.setAttribute('title', savedTitle);
    activeEl = null;
    savedTitle = '';
  }

  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest('[title]');
    if (!el) return;

    const t = el.getAttribute('title');
    if (!t) return;

    if (activeEl !== el) {
      if (activeEl) activeEl.setAttribute('title', savedTitle);
      activeEl = el;
      savedTitle = t;
      el.setAttribute('title', ''); // отключаем нативный tooltip без задержки
    }

    show(savedTitle, e.clientX, e.clientY);
  }, true);

  document.addEventListener('pointermove', (e) => {
    if (!activeEl) return;
    place(e.clientX, e.clientY);
  }, true);

  document.addEventListener('pointerout', (e) => {
    if (!activeEl) return;
    const related = e.relatedTarget;
    if (related && activeEl.contains(related)) return;
    hide();
  }, true);

  window.addEventListener('blur', hide);
}

function setupGraphZoomAndPan() {
  const viewport = document.getElementById('graphViewport');
  const graphEl = document.getElementById('graph');

  const zoomIn = document.getElementById('zoomIn');
  const zoomOut = document.getElementById('zoomOut');

  if (!viewport || !graphEl || !zoomIn || !zoomOut) return;

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const load = () => {
    const v = parseFloat(localStorage.getItem('td_graph_zoom') || '1');
    return Number.isFinite(v) ? v : 1;
  };
  const save = (z) => localStorage.setItem('td_graph_zoom', String(z));

  let zoom = load();
  let baseW = 0;
  let baseH = 0;

  function recomputeBase() {
    baseW = Math.round(viewport.clientWidth);
    baseH = Math.round(viewport.clientHeight);
  }

  function applyZoom(keepCenter = true) {
    zoom = clamp(zoom, 1, 3);
    if (!baseW || !baseH) recomputeBase();

    const prevZoom = graphEl._prevZoom || 1;

    const wPrev = Math.round(baseW * prevZoom);
    const hPrev = Math.round(baseH * prevZoom);

    const wNext = Math.round(baseW * zoom);
    const hNext = Math.round(baseH * zoom);

    if (keepCenter && wPrev > 0 && hPrev > 0) {
      const cx = (viewport.scrollLeft + viewport.clientWidth / 2) / wPrev;
      const cy = (viewport.scrollTop + viewport.clientHeight / 2) / hPrev;

      graphEl.style.width = wNext + 'px';
      graphEl.style.height = hNext + 'px';

      viewport.scrollLeft = cx * wNext - viewport.clientWidth / 2;
      viewport.scrollTop = cy * hNext - viewport.clientHeight / 2;
    } else {
      graphEl.style.width = wNext + 'px';
      graphEl.style.height = hNext + 'px';
    }

    graphEl._prevZoom = zoom;
    save(zoom);
  }

  function zoomBy(delta) {
    zoom = clamp(zoom + delta, 1, 3);
    applyZoom(true);
  }

  zoomIn.onclick = () => zoomBy(0.25);
  zoomOut.onclick = () => zoomBy(-0.25);

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    zoomBy(delta);
  }, { passive: false });

  // pan with threshold; do not hijack node clicks
  const THRESH = 4;
  let candidate = false;
  let dragging = false;
  let startX = 0, startY = 0, startSL = 0, startST = 0;

  viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('.g-node')) return;
    candidate = true;
    dragging = false;
    startX = e.clientX;
    startY = e.clientY;
    startSL = viewport.scrollLeft;
    startST = viewport.scrollTop;
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!candidate) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!dragging) {
      if (Math.hypot(dx, dy) < THRESH) return;
      dragging = true;
      viewport.classList.add('dragging');
      viewport.setPointerCapture(e.pointerId);
    }

    viewport.scrollLeft = startSL - dx;
    viewport.scrollTop = startST - dy;
  });

  viewport.addEventListener('pointerup', () => {
    candidate = false;
    if (dragging) {
      dragging = false;
      viewport.classList.remove('dragging');
    }
  });

  viewport.addEventListener('pointercancel', () => {
    candidate = false;
    dragging = false;
    viewport.classList.remove('dragging');
  });

  const ro = new ResizeObserver(() => {
    const oldW = baseW, oldH = baseH;
    recomputeBase();
    if (Math.abs(oldW - baseW) <= 1 && Math.abs(oldH - baseH) <= 1) return;
    applyZoom(false);
  });
  ro.observe(viewport);

  requestAnimationFrame(() => {
    recomputeBase();
    applyZoom(false);
  });
}


function loadSettings() {
  try {
    const raw = localStorage.getItem('td_settings');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveSettings(st) {
  localStorage.setItem('td_settings', JSON.stringify(st));
}

async function load() {
  const data = window.TXTS_INLINE
    ? window.TXTS_INLINE
    : await (await fetch('./txts.json')).json();

  document.getElementById('title').textContent = data.meta.work;
  document.getElementById('part').textContent = data.meta.part;
  document.getElementById('srcNote').textContent = data.meta.src;
  document.getElementById('methodNote').textContent = data.meta.note;
  document.getElementById('projectName').textContent = data.meta.work;
  document.getElementById('partName').textContent = data.meta.part;

  const graph = buildGraphIndex(data);

  // ---- render state ----
  let lastState = null;
  let lastAutoKey = null;

  // ---- settings ----
  const settings = {
    highlightMode: 'doc', // doc|para|off
    fontSize: 17,
    autoScroll: false
  };
  Object.assign(settings, loadSettings() || {});
  document.documentElement.style.setProperty('--textSize', settings.fontSize + 'px');

  const settingsBtn = document.getElementById('settingsBtn');
  const settingsPanel = document.getElementById('settingsPanel');
  const fontMinus = document.getElementById('fontMinus');
  const fontPlus = document.getElementById('fontPlus');
  const fontValue = document.getElementById('fontValue');
  const autoScrollEl = document.getElementById('autoScroll');

  function updateSettingsUI() {
    if (!settingsPanel) return;
    settingsPanel.querySelectorAll('input[type="radio"][name="hl"]').forEach(r => {
      r.checked = (r.value === settings.highlightMode);
    });
    if (autoScrollEl) autoScrollEl.checked = !!settings.autoScroll;
    if (fontValue) fontValue.textContent = settings.fontSize + 'px';
  }

  function applySettings() {
    document.documentElement.style.setProperty('--textSize', settings.fontSize + 'px');
    saveSettings(settings);
    updateSettingsUI();
    if (lastState) render(lastState);
  }

  if (settingsBtn && settingsPanel) {
    settingsBtn.onclick = () => {
      settingsPanel.hidden = !settingsPanel.hidden;
      updateSettingsUI();
    };

    document.addEventListener('mousedown', (e) => {
      if (settingsPanel.hidden) return;
      if (settingsPanel.contains(e.target) || settingsBtn.contains(e.target)) return;
      settingsPanel.hidden = true;
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') settingsPanel.hidden = true;
    });

    settingsPanel.querySelectorAll('input[type="radio"][name="hl"]').forEach(r => {
      r.onchange = () => {
        settings.highlightMode = r.value;
        applySettings();
      };
    });
  }

  if (fontMinus) fontMinus.onclick = () => { settings.fontSize = Math.max(11, settings.fontSize - 1); applySettings(); };
  if (fontPlus) fontPlus.onclick = () => { settings.fontSize = Math.min(26, settings.fontSize + 1); applySettings(); };
  if (autoScrollEl) autoScrollEl.onchange = () => { settings.autoScroll = !!autoScrollEl.checked; applySettings(); };

  updateSettingsUI();
  applySettings();

  // ---- DOM elements ----
  const els = {
    graphSvg: document.getElementById('graphSvg'),
    graphNodes: document.getElementById('graphNodes'),
    edgeOptions: document.getElementById('edgeOptions'),
    edgeProgress: document.getElementById('edgeProgress'),
    slider: document.getElementById('slider'),
    opsFill: document.getElementById('opsFill')
  };

  const edgeLeftLabelEl = document.getElementById('edgeLeftLabel');
  const edgeRightLabelEl = document.getElementById('edgeRightLabel');
  

  let graphMap = null;

  function render(st) {
    lastState = st;
    const view = st.buildViewState();

    drawText(view.tokens, view.exact, view.curOp, settings);

    const status = st.getStatusLabel();
    const statusEl = document.getElementById('status');
    if (statusEl) {
      statusEl.textContent = status.text;
      statusEl.className = status.cls;
    }

    const stepEl = document.getElementById('stepLabel');
    if (stepEl) stepEl.textContent = '';

    if (st.mode === 'edge' && st.currentEdge) {
      const e = st.currentEdge;
      const fromV = graph.versionsById.get(e.from);
      const toV = graph.versionsById.get(e.to);



      renderEdgeLabel(edgeLeftLabelEl, fromV);
      renderEdgeLabel(edgeRightLabelEl, toV);

    } else if (st.mode === 'node') {
      const curV = graph.versionsById.get(st.nodeId);

      renderEdgeLabel(edgeLeftLabelEl, curV);
      renderEdgeLabel(edgeRightLabelEl, null);
    }

    graphMap?.update(st);

    if (settings.autoScroll && st.mode === 'edge') {
      const key = `${st.edgeKey}:${st.step}:${settings.highlightMode}`;
      if (key !== lastAutoKey) {
        lastAutoKey = key;
        const focusEl = document.querySelector('#text .token.focus');
        if (focusEl) {
          focusEl.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        }
      }
    }
  }

  const player = createEdgePlayer({
    data,
    graph,
    els,
    onStateChange: (st) => render(st)
  });

  graphMap = createGraphMap({
    data,
    graph,
    els,
    onNodeClick: (id) => {
      if (player.jumpToNodeAtEnd) player.jumpToNodeAtEnd(id);
      else {
        player.setPathToNode?.(id);
        player.goToNode?.(id);
      }
    }
  });

  graphMap.update(player.getState());

  setupGraphZoomAndPan();
  setupInstantTooltip();

  document.getElementById('prev').onclick = () => player.prev();
  document.getElementById('next').onclick = () => player.next();
  document.getElementById('slider').oninput = (e) => player.setStep(e.target.value);

  document.addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement && e.target.type === 'range') return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); player.prev(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); player.next(); }
  });
}



load();

