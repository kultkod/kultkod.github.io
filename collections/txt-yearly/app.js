/* =========================================================
   TXT YEARLY — KULTKOD
   ========================================================= */

// STATE

let slides = [];
let currentIndex = 0;
let isDragging = false;

const MIN_FONT = 11;
const MAX_FONT = 24;
const DEF_FONT = 17;

const SCALE_BREAK = 1800;
const SCALE_BREAK_POS = 15;

let currentFontSize = DEF_FONT;


// ELEMENTS


const areaEl = document.getElementById("slide-area");
const yearEl = document.getElementById("slide-year");
const reader = document.getElementById("reader");
const contentEl = document.getElementById("slide-content");
const counterEl = document.getElementById("counter");

const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const randomBtn = document.getElementById("random-year");

const timeline = document.getElementById("timeline");
const cursor = document.getElementById("timeline-cursor");

const settingsBtn = document.getElementById("settings-button");
const settingsPanel = document.getElementById("settings-panel");

const fontValue = document.getElementById("font-size-value");
const fontIncrease = document.getElementById("font-increase");
const fontDecrease = document.getElementById("font-decrease");

const collectionInfo = document.getElementById("collection-info");


const accuracyTrigger = document.getElementById("accuracy-trigger");
const accuracyTooltip = document.getElementById("accuracy-tooltip");


// PARSER

function parseMarkdown(content) {
  const blocks = content
    .replace(/\r\n?/g, "\n")
    .split(/^\s*===\s*$/m)
    .filter(Boolean);

  const raw = [];

  blocks.forEach((block, index) => {
    const match = block.trim().match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);

    if (!match) {
      console.warn(`Некорректный блок ${index + 1}`);
      return;
    }

    const meta = {};

    match[1].split("\n").forEach(line => {
      const idx = line.indexOf(":");
      if (idx !== -1) {
        meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    });

    const year = Number(meta.year);
    const text = match[2].trim();

    if (!Number.isInteger(year) || !meta.author || !meta.title || !text) {
      console.warn(`Неполные данные в блоке ${index + 1}`);
      return;
    }

    raw.push({
      year,
      author: meta.author,
      title: meta.title,
      note: meta.note || "",
      text
    });
  });

  const groups = new Map();

  raw.forEach(item => {
    if (!groups.has(item.year)) groups.set(item.year, []);
    groups.get(item.year).push(item);
  });

  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, fragments]) => ({ year, fragments }));
}


// SETTINGS

function applyFontSize() {
  document.documentElement.style.setProperty(
    "--reading-font-size",
    `${currentFontSize}px`
  );

  fontValue.textContent = `${currentFontSize} px`;
  fontDecrease.disabled = currentFontSize <= MIN_FONT;
  fontIncrease.disabled = currentFontSize >= MAX_FONT;
}

function changeFontSize(delta) {
  currentFontSize = Math.max(
    MIN_FONT,
    Math.min(MAX_FONT, currentFontSize + delta)
  );

  applyFontSize();

  try {
    localStorage.setItem("readingFontSize", currentFontSize);
  } catch (error) {
    console.warn("Не удалось сохранить настройки", error);
  }
}

function loadSettings() {
  try {
    const saved = Number(localStorage.getItem("readingFontSize"));

    if (Number.isInteger(saved) && saved >= MIN_FONT && saved <= MAX_FONT) {
      currentFontSize = saved;
    }
  } catch (error) {
    console.warn("Не удалось загрузить настройки", error);
  }

  applyFontSize();
}

fontIncrease.onclick = () => changeFontSize(1);
fontDecrease.onclick = () => changeFontSize(-1);

function closeSettings() {
  settingsPanel.hidden = true;
  settingsBtn.setAttribute("aria-expanded", "false");
}

settingsBtn.onclick = () => {
  settingsPanel.hidden = !settingsPanel.hidden;
  settingsBtn.setAttribute("aria-expanded", String(!settingsPanel.hidden));
};

document.addEventListener("pointerdown", event => {
  if (
    !settingsPanel.hidden &&
    !settingsPanel.contains(event.target) &&
    !settingsBtn.contains(event.target)
  ) closeSettings();
});



// ACCURACY TOOLTIP

function closeAccuracyTooltip() {
  accuracyTooltip.hidden = true;
  accuracyTrigger.setAttribute("aria-expanded", "false");
}

accuracyTrigger.addEventListener("click", () => {
  accuracyTooltip.hidden = !accuracyTooltip.hidden;
  accuracyTrigger.setAttribute("aria-expanded", String(!accuracyTooltip.hidden));
});

document.addEventListener("pointerdown", event => {
  if (
    !accuracyTooltip.hidden &&
    !accuracyTooltip.contains(event.target) &&
    !accuracyTrigger.contains(event.target)
  ) closeAccuracyTooltip();
});

document.addEventListener("keydown", event => {
  if (event.key !== "Escape") return;

  if (!settingsPanel.hidden) {
    closeSettings();
    settingsBtn.focus();
  }

  if (!accuracyTooltip.hidden) {
    closeAccuracyTooltip();
    accuracyTrigger.focus();
  }
});


// RENDER

function render() {
  if (!slides.length) return;

  const slide = slides[currentIndex];
  yearEl.textContent = slide.year;

  const nodes = slide.fragments.map(fragment => {
    const unit = document.createElement("div");
    unit.className = "fragment-unit";

    const header = document.createElement("header");
    header.className = "unit-header";

    const author = document.createElement("div");
    author.className = "unit-author";
    author.textContent = fragment.author;

    const title = document.createElement("div");
    title.className = "unit-title";
    title.textContent = fragment.title;

    const text = document.createElement("div");
    text.className = "unit-text";
    text.textContent = fragment.text;

    header.append(author, title);
    unit.append(header, text);

    return unit;
  });

  contentEl.replaceChildren(...nodes);

  counterEl.textContent = `${currentIndex + 1} / ${slides.length}`;
  prevBtn.disabled = currentIndex === 0;
  nextBtn.disabled = currentIndex === slides.length - 1;
  randomBtn.disabled = slides.length < 2;

  updateTimeline();
}


// TIMELINE SCALE

function getPos(year) {
  const start = slides[0].year;
  const end = slides[slides.length - 1].year;

  if (start === end) return 50;

  if (end <= SCALE_BREAK || start >= SCALE_BREAK) {
    return ((year - start) / (end - start)) * 100;
  }

  if (year <= SCALE_BREAK) {
    return ((year - start) / (SCALE_BREAK - start)) * SCALE_BREAK_POS;
  }

  return SCALE_BREAK_POS +
    ((year - SCALE_BREAK) / (end - SCALE_BREAK)) * (100 - SCALE_BREAK_POS);
}


// TIMELINE RENDER

function updateTimeline() {
  const slide = slides[currentIndex];
  cursor.style.left = `${getPos(slide.year)}%`;

  timeline.setAttribute("aria-valuemin", slides[0].year);
  timeline.setAttribute("aria-valuemax", slides[slides.length - 1].year);
  timeline.setAttribute("aria-valuenow", slide.year);
  timeline.setAttribute(
    "aria-valuetext",
    `${slide.year}, фрагментов: ${slide.fragments.length}`
  );
}

function buildTimeline() {
  const start = slides[0].year;
  const end = slides[slides.length - 1].year;

  const ticks = document.getElementById("timeline-ticks");
  const markers = document.getElementById("timeline-markers");

  ticks.replaceChildren();
  markers.replaceChildren();

  function addTick(year, label = false) {
    const tick = document.createElement("div");
    tick.className = "timeline-tick";
    tick.style.left = `${getPos(year)}%`;

    if (label) {
      tick.classList.add("major");

      const span = document.createElement("span");
      span.className = "timeline-tick-label";
      span.textContent = year;
      tick.appendChild(span);
    }

    ticks.appendChild(tick);
  }

  // До 1800 — столетия.
  if (start < SCALE_BREAK) {
    for (
      let year = Math.ceil(start / 100) * 100;
      year < Math.min(end, SCALE_BREAK);
      year += 100
    ) {
      addTick(year, year % 200 === 0);
    }
  }

  // Граница масштабов.
  if (start < SCALE_BREAK && end > SCALE_BREAK) {
    addTick(SCALE_BREAK, true);
  }

  // После 1800 — каждое десятилетие.
  if (end > SCALE_BREAK) {
    const first = Math.ceil(Math.max(start, SCALE_BREAK + 1) / 10) * 10;

    for (let year = first; year <= end; year += 10) {
      addTick(year, true);
    }
  }

  // Годы с фрагментами.
  slides.forEach(slide => {
    const marker = document.createElement("div");
    marker.className = "timeline-marker";
    marker.style.left = `${getPos(slide.year)}%`;
    markers.appendChild(marker);
  });
}


// NAVIGATION


function goTo(index, updateHash = true) {
  if (index < 0 || index >= slides.length || index === currentIndex) return;

  currentIndex = index;

  // Сбрасываем только внутреннюю прокрутку.
  areaEl.scrollTop = 0;

  render();

  if (updateHash) {
    history.replaceState(null, "", "#" + slides[currentIndex].year);
  }
}

prevBtn.onclick = () => goTo(currentIndex - 1);
nextBtn.onclick = () => goTo(currentIndex + 1);

randomBtn.onclick = () => {
  if (slides.length < 2) return;

  const index = Math.floor(Math.random() * (slides.length - 1));
  goTo(index >= currentIndex ? index + 1 : index);
};


// TIMELINE DRAG

function handlePointer(event) {
  if (!slides.length) return;

  const rect = timeline.getBoundingClientRect();
  if (!rect.width) return;

  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));

  let nearest = 0;
  let distance = Infinity;

  slides.forEach((slide, index) => {
    const d = Math.abs(getPos(slide.year) / 100 - x);

    if (d < distance) {
      distance = d;
      nearest = index;
    }
  });

  goTo(nearest, false, false);
}

timeline.addEventListener("pointerdown", event => {
  if (!slides.length || event.button !== 0) return;

  event.preventDefault();
  isDragging = true;
  timeline.classList.add("dragging");

  timeline.setPointerCapture(event.pointerId);
  handlePointer(event);
});

timeline.addEventListener("pointermove", event => {
  if (isDragging) handlePointer(event);
});

function finishDrag(event) {
  if (!isDragging) return;

  isDragging = false;
  timeline.classList.remove("dragging");

  if (timeline.hasPointerCapture(event.pointerId)) {
    timeline.releasePointerCapture(event.pointerId);
  }

  history.replaceState(null, "", "#" + slides[currentIndex].year);
}

timeline.addEventListener("pointerup", event => {
  if (!isDragging) return;
  handlePointer(event);
  finishDrag(event);
});

timeline.addEventListener("pointercancel", finishDrag);
timeline.addEventListener("lostpointercapture", finishDrag);

// TOUCH SWIPE

let touchStartX = 0;
let touchStartY = 0;

const SWIPE_THRESHOLD = 60;

areaEl.addEventListener("touchstart", event => {
  if (event.touches.length !== 1) return;

  touchStartX = event.touches[0].clientX;
  touchStartY = event.touches[0].clientY;
}, { passive: true });

areaEl.addEventListener("touchend", event => {
  if (!event.changedTouches.length) return;

  const deltaX = event.changedTouches[0].clientX - touchStartX;
  const deltaY = event.changedTouches[0].clientY - touchStartY;

  // Игнорируем небольшие и преимущественно вертикальные жесты.
  if (
    Math.abs(deltaX) < SWIPE_THRESHOLD ||
    Math.abs(deltaX) < Math.abs(deltaY) * 1.5
  ) return;

  // Свайп влево — следующий год.
  if (deltaX < 0) {
    goTo(currentIndex + 1);
  } else {
    // Свайп вправо — предыдущий год.
    goTo(currentIndex - 1);
  }
}, { passive: true });


// KEYBOARD

document.addEventListener("keydown", event => {
  if (!slides.length) return;

  const target = event.target;

  if (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  ) return;

  if (event.key === "ArrowRight") {
    event.preventDefault();
    goTo(currentIndex + 1);
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    goTo(currentIndex - 1);
  }

  if (document.activeElement === timeline) {
    if (event.key === "Home") {
      event.preventDefault();
      goTo(0);
    }

    if (event.key === "End") {
      event.preventDefault();
      goTo(slides.length - 1);
    }
  }
});


// DEEP LINKING

function openFromHash() {
  const year = Number(window.location.hash.slice(1));
  const index = slides.findIndex(slide => slide.year === year);

  if (index >= 0) {
    currentIndex = index;

    document.getElementById("slide-area").scrollTop = 0;

    render();
  }
}

window.addEventListener("hashchange", () => {
  if (slides.length) openFromHash();
});


// INIT

async function init() {
  try {
    const response = await fetch("./texts.md");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    slides = parseMarkdown(await response.text());
    if (!slides.length) throw new Error("В коллекции нет корректных фрагментов");

    buildTimeline();

    const year = Number(window.location.hash.slice(1));
    const index = slides.findIndex(slide => slide.year === year);

    currentIndex = index >= 0
      ? index
      : Math.floor(Math.random() * slides.length);

    const count = slides.reduce(
      (sum, slide) => sum + slide.fragments.length, 0
    );

    collectionInfo.textContent =
      `${slides[0].year}–${slides[slides.length - 1].year} · Фрагментов: ${count}`;

    render();

  } catch (error) {
    console.error(error);

    collectionInfo.textContent = "Ошибка загрузки";
    contentEl.textContent = "Не удалось загрузить коллекцию. Проверьте texts.md.";

    prevBtn.disabled = true;
    nextBtn.disabled = true;
    randomBtn.disabled = true;
  }
}

loadSettings();
init();