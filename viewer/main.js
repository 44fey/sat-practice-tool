// SAT Math Local Viewer
// Bluebook-style layout with playlist navigation + progress tracking.

const DOMAIN_NAMES = {
  // Math
  H: 'Algebra',
  P: 'Advanced Math',
  Q: 'Problem-Solving and Data Analysis',
  S: 'Geometry and Trigonometry',
  // Reading & Writing
  INI: 'Information and Ideas',
  CAS: 'Craft and Structure',
  EOI: 'Expression of Ideas',
  SEC: 'Standard English Conventions',
};
const DIFF_NAMES = { E: 'Easy', M: 'Medium', H: 'Hard' };

const SECTIONS = {
  math:    { title: 'SAT Math',                 dir: 'math'    },
  reading: { title: 'SAT Reading & Writing',    dir: 'reading' },
};
const SECTION_KEY = 'sat-section-v1';
const PLAYLISTS_KEY = 'sat-playlists-v1';
const progressKeyFor = (section) => `sat-${section}-progress-v1`;
const initialSection = (() => {
  const s = localStorage.getItem(SECTION_KEY);
  return SECTIONS[s] ? s : 'math';
})();

const state = {
  section: initialSection,
  index: [],
  filtered: [],
  selected: null,           // current questionId
  selectedIdx: -1,          // index in `filtered`
  filters: {
    search: '',
    domains: new Set(),
    difficulties: new Set(),
    skills: new Set(),
    statuses: new Set(),    // 'unattempted' | 'correct' | 'incorrect'
    markedOnly: false,
  },
  progress: loadProgress(initialSection),
  playlists: loadPlaylists(),
  activePlaylistId: null,
  selectMode: false,
  selectedIds: new Set(),
  // per-question runtime grading state (not persisted between question switches)
  current: {
    qid: null,
    type: null,             // 'mcq' | 'spr'
    pickedKey: null,        // letter for MCQ ('A'..'D') or null
    correctKey: null,       // for MCQ — the correct letter
    correctIds: null,       // for modern MCQ — Set of correct option ids
    sprAccept: null,        // array of accepted answers for SPR
    graded: false,
  },
  timer: {
    startedAt: null,        // Date.now() when current question loaded
    elapsedMs: 0,           // running total for current question
    intervalId: null,
    locked: false,          // stops counting once submitted
  },
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* -------- playlists persistence (global; each playlist tagged with section) -------- */
function loadPlaylists() {
  try { return JSON.parse(localStorage.getItem(PLAYLISTS_KEY) || '{}'); }
  catch { return {}; }
}
function savePlaylists() {
  try { localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(state.playlists)); }
  catch (e) { console.warn('savePlaylists failed:', e); }
}
function newPlaylistId() {
  return 'pl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}
function playlistsForCurrentSection() {
  return Object.values(state.playlists)
    .filter((p) => p.section === state.section)
    .sort((a, b) => b.created - a.created);
}

/* -------- progress persistence (per-section) -------- */
function loadProgress(section) {
  try {
    const raw = localStorage.getItem(progressKeyFor(section));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveProgress() {
  try { localStorage.setItem(progressKeyFor(state.section), JSON.stringify(state.progress)); }
  catch (e) { console.warn('saveProgress failed:', e); }
}
function statusFor(qid) {
  const p = state.progress[qid];
  return p ? p.status : 'unattempted';
}
function recordAttempt(qid, status, extras = {}) {
  state.progress[qid] = {
    status,
    ts: Date.now(),
    ...extras,
  };
  saveProgress();
  refreshProgressUI();
}
function refreshProgressUI() {
  let c = 0, w = 0, m = 0;
  for (const v of Object.values(state.progress)) {
    if (v.status === 'correct') c++;
    else if (v.status === 'incorrect') w++;
    if (v.marked) m++;
  }
  const todo = state.index.length - c - w;
  $('#ps-correct-n').textContent = c;
  $('#ps-wrong-n').textContent = w;
  $('#ps-todo-n').textContent = todo;
  $('#ps-marked-n').textContent = m;
  // refresh status dots + bookmark icons in visible list
  $$('#question-list li[data-id]').forEach((li) => {
    const dot = li.querySelector('.status-dot');
    if (dot) {
      const s = statusFor(li.dataset.id);
      dot.classList.toggle('correct', s === 'correct');
      dot.classList.toggle('incorrect', s === 'incorrect');
    }
    const markEl = li.querySelector('.mark-icon');
    const isMarked = !!(state.progress[li.dataset.id]?.marked);
    if (markEl) markEl.style.visibility = isMarked ? 'visible' : 'hidden';
  });
}

/* -------- index loading -------- */
async function loadIndex() {
  const res = await fetch(`../data/${state.section}/index.json`);
  state.index = await res.json();
  // Normalize a known College Board casing typo so the same skill doesn't
  // appear twice in the filter pills.
  for (const q of state.index) {
    if ((q.skill_desc || '').trim() === 'Cross-text Connections') {
      q.skill_desc = 'Cross-Text Connections';
    }
  }
  $('#all-count').textContent = state.index.length;
  $('#section-title').textContent = SECTIONS[state.section].title;
  buildFilters();
  renderPlaylists();
  applyFilters();
  refreshProgressUI();
}

async function switchSection(name) {
  if (!SECTIONS[name] || name === state.section) return;
  // Reset transient state but persist nothing — progress is kept in its own
  // localStorage bucket per section.
  state.section = name;
  localStorage.setItem(SECTION_KEY, name);
  state.selected = null;
  state.selectedIdx = -1;
  state.filtered = [];
  state.filters.search = '';
  state.filters.domains.clear();
  state.filters.difficulties.clear();
  state.filters.skills.clear();
  state.filters.statuses.clear();
  state.filters.markedOnly = false;
  state.progress = loadProgress(name);
  // Section switch exits any active playlist (playlists are section-scoped)
  state.activePlaylistId = null;
  $('#active-playlist-banner').hidden = true;
  if (state.selectMode) toggleSelectMode(false);
  $('#search-id').value = '';
  $$('#section-switch button').forEach((b) => b.classList.toggle('active', b.dataset.section === name));
  // Hide the question viewer until something is picked again.
  $('#question-content').hidden = true;
  $('#empty-state').hidden = false;
  $('#bb-position').textContent = '—';
  await loadIndex();
  updateNavButtons();
}

/* -------- filters -------- */
function buildFilters() {
  // Group skills under each domain so the filter can be rendered as a nested
  // expandable hierarchy.
  const tree = new Map(); // domainCode -> { count, skills: Map<skillName, count> }
  const diffs = new Map();
  for (const q of state.index) {
    const d = q.primary_class_cd;
    const sk = (q.skill_desc || '').trim();
    if (!tree.has(d)) tree.set(d, { count: 0, skills: new Map() });
    const node = tree.get(d);
    node.count++;
    node.skills.set(sk, (node.skills.get(sk) || 0) + 1);
    diffs.set(q.difficulty, (diffs.get(q.difficulty) || 0) + 1);
  }

  renderCategories(tree);

  renderPills('#filter-difficulty',
    [['E', diffs.get('E') || 0], ['M', diffs.get('M') || 0], ['H', diffs.get('H') || 0]],
    ([code, n]) => ({
      label: `${DIFF_NAMES[code]} (${n})`,
      value: code,
      setRef: state.filters.difficulties,
    })
  );

  // Status pills already exist in the DOM — just bind them.
  $$('#filter-status .pill[data-status]').forEach((p) => {
    p.addEventListener('click', () => {
      const v = p.dataset.status;
      const s = state.filters.statuses;
      if (s.has(v)) s.delete(v); else s.add(v);
      p.classList.toggle('active');
      applyFilters();
    });
  });

  // "★ Marked" filter (also bound to the same toggle from the progress summary)
  const setMarkedOnly = (on) => {
    state.filters.markedOnly = on;
    $('#filter-marked').classList.toggle('active', on);
    $('#ps-marked-pill').classList.toggle('active', on);
    applyFilters();
  };
  $('#filter-marked').addEventListener('click', () => setMarkedOnly(!state.filters.markedOnly));
  $('#ps-marked-pill').addEventListener('click', () => setMarkedOnly(!state.filters.markedOnly));
}

function renderCategories(tree) {
  const root = $('#filter-categories');
  root.innerHTML = '';
  // sort domains alphabetically by display name
  const sorted = [...tree.entries()].sort(
    (a, b) => (DOMAIN_NAMES[a[0]] || a[0]).localeCompare(DOMAIN_NAMES[b[0]] || b[0])
  );
  for (const [code, node] of sorted) {
    const det = document.createElement('details');
    det.className = 'cat-domain';

    const sum = document.createElement('summary');
    const isDomainActive = state.filters.domains.has(code);
    sum.innerHTML = `
      <span class="cat-checkbox ${isDomainActive ? 'checked' : ''}" data-domain="${code}" title="Filter by ${DOMAIN_NAMES[code] || code}">${isDomainActive ? '✓' : ''}</span>
      <span class="cat-name">${DOMAIN_NAMES[code] || code}</span>
      <span class="cat-count">${node.count}</span>
      <svg class="cat-chevron" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6">
        <polyline points="3,4.5 6,7.5 9,4.5"/>
      </svg>
    `;
    // checkbox toggles domain filter without expanding
    sum.querySelector('.cat-checkbox').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const set = state.filters.domains;
      if (set.has(code)) set.delete(code); else set.add(code);
      e.currentTarget.classList.toggle('checked');
      e.currentTarget.textContent = set.has(code) ? '✓' : '';
      applyFilters();
    });
    det.appendChild(sum);

    const body = document.createElement('div');
    body.className = 'cat-skills';
    const sortedSkills = [...node.skills.entries()].sort();
    for (const [skill, n] of sortedSkills) {
      const row = document.createElement('div');
      row.className = 'cat-skill';
      const isActive = state.filters.skills.has(skill);
      if (isActive) row.classList.add('active');
      row.innerHTML = `
        <span class="cat-checkbox ${isActive ? 'checked' : ''}">${isActive ? '✓' : ''}</span>
        <span class="cat-name">${skill}</span>
        <span class="cat-count">${n}</span>
      `;
      row.addEventListener('click', () => {
        const set = state.filters.skills;
        if (set.has(skill)) set.delete(skill); else set.add(skill);
        row.classList.toggle('active');
        const cb = row.querySelector('.cat-checkbox');
        cb.classList.toggle('checked');
        cb.textContent = set.has(skill) ? '✓' : '';
        applyFilters();
      });
      body.appendChild(row);
    }
    det.appendChild(body);
    root.appendChild(det);
  }
}

function renderPills(containerSel, items, mapper) {
  const c = $(containerSel);
  c.classList.add('pill-group');
  c.innerHTML = '';
  for (const it of items) {
    const { label, value, setRef } = mapper(it);
    const span = document.createElement('span');
    span.className = 'pill';
    span.textContent = label;
    span.dataset.value = value;
    span.addEventListener('click', () => {
      if (setRef.has(value)) setRef.delete(value); else setRef.add(value);
      span.classList.toggle('active');
      applyFilters();
    });
    c.appendChild(span);
  }
}

function applyFilters() {
  const f = state.filters;
  const search = f.search.trim().toLowerCase();
  // If a playlist is active, restrict the universe to its IDs first.
  let pool = state.index;
  if (state.activePlaylistId && state.playlists[state.activePlaylistId]) {
    const ids = new Set(state.playlists[state.activePlaylistId].ids);
    pool = pool.filter((q) => ids.has(q.questionId));
  }
  state.filtered = pool.filter((q) => {
    if (search && !q.questionId.toLowerCase().includes(search)) return false;
    if (f.domains.size && !f.domains.has(q.primary_class_cd)) return false;
    if (f.difficulties.size && !f.difficulties.has(q.difficulty)) return false;
    if (f.skills.size && !f.skills.has((q.skill_desc || '').trim())) return false;
    if (f.statuses.size && !f.statuses.has(statusFor(q.questionId))) return false;
    if (f.markedOnly && !state.progress[q.questionId]?.marked) return false;
    return true;
  });
  $('#filtered-count').textContent = state.filtered.length;
  renderList();
  // Recompute selected index
  state.selectedIdx = state.filtered.findIndex((q) => q.questionId === state.selected);
  updateNavButtons();
}

function renderList() {
  const list = $('#question-list');
  list.innerHTML = '';
  const items = state.filtered.slice(0, 500);
  for (const q of items) {
    const li = document.createElement('li');
    li.dataset.id = q.questionId;
    if (state.selected === q.questionId) li.classList.add('selected');
    const s = statusFor(q.questionId);
    const marked = !!(state.progress[q.questionId]?.marked);
    const picked = state.selectedIds.has(q.questionId);
    li.innerHTML = `
      <span class="qrow-cb ${picked ? 'checked' : ''}">${picked ? '✓' : ''}</span>
      <span class="qid">${q.questionId}</span>
      <span class="row-right">
        <span class="mark-icon" style="visibility:${marked ? 'visible' : 'hidden'}">★</span>
        <span class="status-dot ${s}"></span>
        <span class="diff diff-${q.difficulty}">${q.difficulty}</span>
      </span>
    `;
    li.title = `${DOMAIN_NAMES[q.primary_class_cd] || q.primary_class_cd} · ${q.skill_desc}`;
    li.addEventListener('click', () => {
      if (state.selectMode) toggleSelectQuestion(q.questionId);
      else selectQuestion(q.questionId);
    });
    list.appendChild(li);
  }
  if (state.filtered.length > 500) {
    const li = document.createElement('li');
    li.style.color = '#9ca3af';
    li.style.fontStyle = 'italic';
    li.style.cursor = 'default';
    li.textContent = `…and ${state.filtered.length - 500} more (filter to narrow)`;
    list.appendChild(li);
  }
}

/* -------- question rendering -------- */
async function selectQuestion(qid) {
  state.selected = qid;
  state.selectedIdx = state.filtered.findIndex((q) => q.questionId === qid);
  $$('#question-list li').forEach((li) => {
    li.classList.toggle('selected', li.dataset.id === qid);
  });

  const meta = state.index.find((q) => q.questionId === qid);
  if (!meta) return;
  const res = await fetch(`../data/${state.section}/questions/${qid}.json`);
  const data = await res.json();
  renderQuestion(meta, data);
  updateNavButtons();
  // Auto-scroll the selected list item into view
  const liEl = $(`#question-list li[data-id="${qid}"]`);
  if (liEl) liEl.scrollIntoView({ block: 'nearest' });
}

function renderQuestion(meta, data) {
  $('#empty-state').hidden = true;
  $('#question-content').hidden = false;

  // Header
  $('#bb-num').textContent = state.selectedIdx >= 0 ? String(state.selectedIdx + 1) : '·';
  $('#q-id').textContent = meta.questionId;
  $('#q-domain').textContent = DOMAIN_NAMES[meta.primary_class_cd] || meta.primary_class_cd;
  $('#q-skill').textContent = (meta.skill_desc || '').trim();
  $('#q-difficulty').textContent = DIFF_NAMES[meta.difficulty] || meta.difficulty;
  $('#q-difficulty').className = `badge diff-${meta.difficulty}`;
  $('#bb-position').textContent = state.selectedIdx >= 0
    ? `${state.selectedIdx + 1} / ${state.filtered.length}`
    : '—';

  // Reset DOM + per-question state
  const card = $('#question-content');
  const stem = $('#q-stem');
  const choicesEl = $('#q-choices');
  const sprEl = $('#q-spr-input');
  const ans = $('#q-answer');
  const rat = $('#q-rationale');
  ans.hidden = true; rat.hidden = true;
  ans.innerHTML = ''; rat.innerHTML = '';
  choicesEl.innerHTML = '';
  sprEl.hidden = true;
  $('#spr-attempt').value = '';
  $('#spr-result').textContent = '';
  $('#spr-result').className = '';
  $('#submit-status').textContent = '';
  $('#submit-status').className = 'submit-status';
  $('#submit-btn').disabled = true;
  $('#reveal-answer').disabled = true;
  $('#reveal-rationale').disabled = true;
  $('#retry-btn').hidden = true;
  card.classList.remove('graded');

  state.current = {
    qid: meta.questionId,
    type: null,
    pickedKey: null,
    correctKey: null,
    correctIds: null,
    sprAccept: null,
    graded: false,
  };

  let correctAnswerHtml = '';
  let rationaleHtml = '';

  if (data.source === 'modern' || data.source === 'modern-fallback') {
    const d = data.detail;
    // R&W modern questions carry the passage in `stimulus`; math doesn't.
    // Render stimulus + divider + stem so phrases like "based on the text" work.
    const stimulus = d.stimulus || '';
    const stemSrc = d.stem || '';
    stem.innerHTML = stimulus + (stimulus && stemSrc ? '<hr class="stimulus-divider" />' : '') + stemSrc;
    rationaleHtml = d.rationale || '';
    if (d.type === 'mcq' && Array.isArray(d.answerOptions)) {
      state.current.type = 'mcq';
      state.current.correctIds = new Set(d.keys || []);
      const idToLetter = new Map(d.answerOptions.map((o, i) => [o.id, letterFor(i)]));
      const correctLetters = d.answerOptions
        .map((o, i) => state.current.correctIds.has(o.id) ? letterFor(i) : null)
        .filter(Boolean);
      state.current.correctKey = correctLetters[0] || null;
      renderMcqChoices(d.answerOptions, idToLetter);
      correctAnswerHtml = `Correct answer: <strong>${correctLetters.join(', ')}</strong>`;
    } else {
      state.current.type = 'spr';
      sprEl.hidden = false;
      state.current.sprAccept = d.keys || d.correct_answer || [];
      // Enable submit when input non-empty
      $('#spr-attempt').oninput = () => {
        $('#submit-btn').disabled = !$('#spr-attempt').value.trim() || state.current.graded;
      };
      correctAnswerHtml = `Accepted answers: ${state.current.sprAccept.map((a) => `<code>${escapeHtml(a)}</code>`).join(', ')}`;
    }
  } else {
    // legacy
    const d = data.detail;
    const body = d.body || '';
    const prompt = d.prompt || '';
    stem.innerHTML = body + (body && prompt ? '<hr class="stimulus-divider" />' : '') + prompt;
    const a = d.answer || {};
    rationaleHtml = a.rationale || '';
    if (a.style === 'Multiple Choice' && a.choices) {
      state.current.type = 'mcq';
      const letters = Object.keys(a.choices);
      let correct = (a.correct_choice || '').toLowerCase();
      if (!correct && rationaleHtml) {
        const m = rationaleHtml.match(/Choice\s+([A-D])\s+is\s+correct/i);
        if (m) correct = m[1].toLowerCase();
      }
      state.current.correctKey = correct ? correct.toUpperCase() : null;
      renderLegacyChoices(letters, a.choices);
      correctAnswerHtml = correct
        ? `Correct answer: <strong>${correct.toUpperCase()}</strong>`
        : 'See explanation below.';
    } else {
      state.current.type = 'spr';
      sprEl.hidden = false;
      state.current.sprAccept = []; // legacy SPR: no programmatic answers, fall back to rationale
      $('#spr-attempt').oninput = () => {
        $('#submit-btn').disabled = !$('#spr-attempt').value.trim() || state.current.graded;
      };
      correctAnswerHtml = 'See explanation below for accepted answers.';
    }
  }

  ans.innerHTML = correctAnswerHtml;
  rat.innerHTML = rationaleHtml;

  // Mark-for-review state
  const marked = !!(state.progress[meta.questionId]?.marked);
  $('#bb-mark').classList.toggle('marked', marked);

  // Restore prior attempt — if previously answered, jump straight to graded view
  const prior = state.progress[meta.questionId];
  if (prior && (prior.picked || prior.attempt)) {
    if (prior.picked) state.current.pickedKey = prior.picked;
    if (prior.attempt) $('#spr-attempt').value = prior.attempt;
    applyGrade(prior.status);
  }

  // Restart timer for this question
  startTimer();

  if (window.MathJax && window.MathJax.typesetPromise) {
    window.MathJax.typesetPromise([stem, choicesEl, ans, rat]).catch(() => {});
  }
}

function renderMcqChoices(opts, idToLetter) {
  const choicesEl = $('#q-choices');
  opts.forEach((opt) => {
    const letter = idToLetter.get(opt.id);
    const div = document.createElement('div');
    div.className = 'choice';
    div.dataset.optId = opt.id;
    div.dataset.letter = letter;
    div.innerHTML = `<div class="letter">${letter}</div><div class="body">${opt.content}</div>`;
    div.addEventListener('click', () => onChoiceClick(div, letter));
    choicesEl.appendChild(div);
  });
}

function renderLegacyChoices(letters, choices) {
  const choicesEl = $('#q-choices');
  letters.forEach((k) => {
    const letter = k.toUpperCase();
    const div = document.createElement('div');
    div.className = 'choice';
    div.dataset.letter = letter;
    div.dataset.key = k;
    div.innerHTML = `<div class="letter">${letter}</div><div class="body">${choices[k].body}</div>`;
    div.addEventListener('click', () => onChoiceClick(div, letter));
    choicesEl.appendChild(div);
  });
}

function onChoiceClick(div, letter) {
  if (state.current.graded) return;        // locked after submit; click Try again first
  $$('#q-choices .choice').forEach((c) => c.classList.remove('selected'));
  div.classList.add('selected');
  state.current.pickedKey = letter;
  $('#submit-btn').disabled = false;
}

/* -------- grading -------- */
function gradeAnswer() {
  if (state.current.graded) return;
  const c = state.current;
  if (c.type === 'mcq') {
    if (!c.pickedKey) return;
    const isCorrect = c.correctKey ? (c.pickedKey === c.correctKey) : null;
    if (isCorrect == null) {
      // Truly unknown correct answer — fall back to revealing rationale.
      $('#submit-status').textContent = 'No machine-checkable answer for this item — see explanation.';
      $('#submit-status').className = 'submit-status';
      applyGrade('unattempted');
      return;
    }
    recordAttempt(c.qid, isCorrect ? 'correct' : 'incorrect', { picked: c.pickedKey });
    applyGrade(isCorrect ? 'correct' : 'incorrect');
  } else if (c.type === 'spr') {
    const v = $('#spr-attempt').value.trim();
    if (!v) return;
    const accept = c.sprAccept || [];
    if (!accept.length) {
      $('#submit-status').textContent = 'No machine-checkable answer for this item — see explanation.';
      $('#submit-status').className = 'submit-status';
      applyGrade('unattempted');
      return;
    }
    const ok = accept.some((k) => normalizeSpr(k) === normalizeSpr(v));
    recordAttempt(c.qid, ok ? 'correct' : 'incorrect', { attempt: v });
    applyGrade(ok ? 'correct' : 'incorrect');
  }
}

function applyGrade(status) {
  const c = state.current;
  c.graded = true;
  $('#question-content').classList.add('graded');
  $('#submit-btn').disabled = true;
  $('#reveal-answer').disabled = false;
  $('#reveal-rationale').disabled = false;
  $('#retry-btn').hidden = false;
  stopTimer();
  $('#bb-timer').classList.remove('running');
  if (status === 'correct') {
    $('#bb-timer').classList.add('locked');
    $('#submit-status').textContent = '✓ Correct';
    $('#submit-status').className = 'submit-status ok';
  } else if (status === 'incorrect') {
    $('#bb-timer').classList.add('locked-wrong');
    $('#submit-status').textContent = '✗ Incorrect';
    $('#submit-status').className = 'submit-status no';
  }

  if (c.type === 'mcq') {
    // Visualise: picked + correct
    $$('#q-choices .choice').forEach((div) => {
      div.classList.remove('selected', 'correct', 'incorrect');
      const letter = div.dataset.letter;
      if (letter === c.pickedKey) {
        div.classList.add(status === 'correct' ? 'correct' : 'incorrect');
      }
      if (letter === c.correctKey && letter !== c.pickedKey) {
        div.classList.add('correct');
      }
    });
  } else if (c.type === 'spr') {
    if (status === 'correct') {
      $('#spr-result').textContent = '✓ Correct';
      $('#spr-result').className = 'ok';
    } else if (status === 'incorrect') {
      $('#spr-result').textContent = '✗ Incorrect';
      $('#spr-result').className = 'no';
    }
  }
}

function retryQuestion() {
  if (!state.selected) return;
  // Re-render the current question fresh (clears graded state, restarts timer).
  delete state.progress[state.selected]; // optional: don't wipe progress on retry
  // Actually preserve progress; just reset the in-page UI so user can re-attempt.
  state.progress[state.selected] = state.progress[state.selected] || {};
  selectQuestion(state.selected);
}

/* -------- timer -------- */
function startTimer() {
  stopTimer();
  state.timer.startedAt = Date.now();
  state.timer.elapsedMs = 0;
  state.timer.locked = false;
  $('#bb-timer').classList.remove('locked', 'locked-wrong');
  $('#bb-timer').classList.add('running');
  updateTimerDisplay();
  state.timer.intervalId = setInterval(updateTimerDisplay, 250);
}
function stopTimer() {
  if (state.timer.intervalId) {
    clearInterval(state.timer.intervalId);
    state.timer.intervalId = null;
  }
  if (state.timer.startedAt) {
    state.timer.elapsedMs = Date.now() - state.timer.startedAt;
    updateTimerDisplay();
  }
}
function updateTimerDisplay() {
  const ms = state.timer.startedAt ? (Date.now() - state.timer.startedAt) : 0;
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = String(totalSec % 60).padStart(2, '0');
  $('#timer-display').textContent = `${m}:${s}`;
}

/* -------- Desmos (offline bundle) -------- */
let desmosInstance = null;
let desmosLoading = false;
async function ensureDesmosLoaded() {
  if (window.Desmos) return;
  if (desmosLoading) {
    while (!window.Desmos) await new Promise((r) => setTimeout(r, 100));
    return;
  }
  desmosLoading = true;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    // Bundled offline copy — works with no internet.
    s.src = '../desmos-offline-main/desmos_files/calculator.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  desmosLoading = false;
}
function bindDesmosResize() {
  const handle = $('#desmos-resize');
  const app = document.querySelector('.app');
  if (!handle) return;

  // Restore persisted width
  const saved = Number(localStorage.getItem('sat-desmos-w') || 0);
  if (saved >= 280 && saved <= 1200) app.style.setProperty('--desmos-w', `${saved}px`);

  let dragging = false;
  let startX = 0;
  let startW = 0;

  const onMove = (e) => {
    if (!dragging) return;
    const dx = startX - e.clientX;
    let w = startW + dx;
    const max = Math.max(360, window.innerWidth - 480);
    w = Math.max(280, Math.min(max, w));
    app.style.setProperty('--desmos-w', `${w}px`);
    if (desmosInstance && desmosInstance.resize) desmosInstance.resize();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    app.classList.remove('resizing-desmos');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    const cur = parseInt(getComputedStyle(app).getPropertyValue('--desmos-w'), 10);
    if (cur > 0) localStorage.setItem('sat-desmos-w', String(cur));
  };
  handle.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    startW = parseInt(getComputedStyle(app).getPropertyValue('--desmos-w'), 10) || 520;
    app.classList.add('resizing-desmos');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  });
}

async function toggleDesmos() {
  const app = document.querySelector('.app');
  const opened = app.classList.toggle('with-desmos');
  $('#desmos-panel').hidden = !opened;
  $('#toggle-desmos').classList.toggle('active', opened);
  if (opened && !desmosInstance) {
    try {
      await ensureDesmosLoaded();
      const elt = $('#desmos-calc');
      desmosInstance = window.Desmos.GraphingCalculator(elt, {
        keypad: true,
        expressions: true,
        graphpaper: true,
        settingsMenu: true,
        zoomButtons: true,
        border: false,
      });
    } catch (e) {
      $('#desmos-calc').innerHTML = '<div style="padding:14px;color:#fff">Could not load Desmos. Make sure <code style="background:#374151;padding:2px 5px;border-radius:3px">desmos-offline-main/desmos_files/calculator.js</code> exists in the project root.</div>';
      console.warn('Desmos load failed', e);
    }
  }
}

/* -------- playlists -------- */
function renderPlaylists() {
  const root = $('#playlists-list');
  root.innerHTML = '';
  const playlists = playlistsForCurrentSection();
  if (!playlists.length) {
    root.innerHTML = '<div class="playlists-empty">No playlists yet. Filter, then "+ Filter".</div>';
    return;
  }
  for (const pl of playlists) {
    const row = document.createElement('div');
    row.className = 'playlist-row';
    if (state.activePlaylistId === pl.id) row.classList.add('active');
    row.innerHTML = `
      <span class="pl-name" title="Activate this playlist">${escapeHtml(pl.name)}</span>
      <span class="pl-count">${pl.ids.length}</span>
      <button class="pl-action" data-action="rename" title="Rename">✎</button>
      <button class="pl-action" data-action="delete" title="Delete">🗑</button>
    `;
    row.querySelector('.pl-name').addEventListener('click', () => activatePlaylist(pl.id));
    row.querySelector('[data-action="rename"]').addEventListener('click', (e) => {
      e.stopPropagation();
      const next = prompt('Rename playlist', pl.name);
      if (next && next.trim()) {
        pl.name = next.trim();
        savePlaylists();
        renderPlaylists();
        if (state.activePlaylistId === pl.id) $('#active-playlist-name').textContent = pl.name;
      }
    });
    row.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!confirm(`Delete playlist "${pl.name}"? This won't affect your saved progress.`)) return;
      delete state.playlists[pl.id];
      savePlaylists();
      if (state.activePlaylistId === pl.id) exitPlaylist();
      renderPlaylists();
    });
    root.appendChild(row);
  }
}

function activatePlaylist(id) {
  const pl = state.playlists[id];
  if (!pl) return;
  state.activePlaylistId = id;
  const banner = $('#active-playlist-banner');
  banner.hidden = false;
  // Re-trigger the slide-in animation each time
  banner.style.animation = 'none';
  void banner.offsetWidth;
  banner.style.animation = '';
  $('#active-playlist-name').textContent = pl.name;
  $('#active-playlist-count').textContent = pl.ids.length;
  // Reset transient filters so the playlist is the focus.
  state.filters.search = '';
  state.filters.statuses.clear();
  state.filters.markedOnly = false;
  $('#search-id').value = '';
  $$('.pill.active').forEach((p) => p.classList.remove('active'));
  $('#ps-marked-pill').classList.remove('active');
  applyFilters();
  renderPlaylists();
  // Float the banner into view at the top of the sidebar.
  banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exitPlaylist() {
  state.activePlaylistId = null;
  $('#active-playlist-banner').hidden = true;
  applyFilters();
  renderPlaylists();
}

function saveCurrentFilterAsPlaylist() {
  if (!state.filtered.length) {
    alert('No questions in the current filter — nothing to save.');
    return;
  }
  const defaultName = suggestPlaylistName();
  const name = prompt(`Save ${state.filtered.length} questions as a new playlist:`, defaultName);
  if (!name || !name.trim()) return;
  const id = newPlaylistId();
  state.playlists[id] = {
    id,
    name: name.trim(),
    section: state.section,
    ids: state.filtered.map((q) => q.questionId),
    created: Date.now(),
  };
  savePlaylists();
  renderPlaylists();
  // Auto-activate the new playlist so user can dive in
  activatePlaylist(id);
}

function suggestPlaylistName() {
  const f = state.filters;
  const parts = [];
  if (f.domains.size) parts.push([...f.domains].map((c) => DOMAIN_NAMES[c] || c).join(', '));
  if (f.skills.size === 1) parts.push([...f.skills][0]);
  else if (f.skills.size > 1) parts.push(`${f.skills.size} skills`);
  if (f.difficulties.size) parts.push([...f.difficulties].map((d) => DIFF_NAMES[d]).join('/'));
  if (f.statuses.size) parts.push([...f.statuses].join('/'));
  if (f.markedOnly) parts.push('★');
  if (state.activePlaylistId && state.playlists[state.activePlaylistId]) {
    parts.unshift(`from ${state.playlists[state.activePlaylistId].name}`);
  }
  return parts.length ? parts.join(' · ') : `Playlist ${new Date().toLocaleString()}`;
}

/* -------- multi-select mode -------- */
function toggleSelectMode(on) {
  state.selectMode = on;
  document.querySelector('.app').classList.toggle('select-mode', on);
  $('#select-toolbar').hidden = !on;
  $('#toggle-select-mode').classList.toggle('active', on);
  if (!on) {
    state.selectedIds.clear();
    updateSelectionUi();
    renderList();
  }
}
function toggleSelectQuestion(qid) {
  if (state.selectedIds.has(qid)) state.selectedIds.delete(qid);
  else state.selectedIds.add(qid);
  // update only that row's checkbox to avoid full redraw
  const li = $(`#question-list li[data-id="${qid}"]`);
  if (li) {
    const cb = li.querySelector('.qrow-cb');
    const on = state.selectedIds.has(qid);
    cb.classList.toggle('checked', on);
    cb.textContent = on ? '✓' : '';
  }
  updateSelectionUi();
}
function updateSelectionUi() {
  $('#select-count').textContent = state.selectedIds.size;
  $('#save-selection').disabled = state.selectedIds.size === 0;
}
function selectAllVisible() {
  for (const q of state.filtered.slice(0, 500)) state.selectedIds.add(q.questionId);
  updateSelectionUi();
  renderList();
}
function saveSelectionAsPlaylist() {
  if (!state.selectedIds.size) return;
  const name = prompt(`Save ${state.selectedIds.size} hand-picked questions as a new playlist:`, `Picks ${new Date().toLocaleDateString()}`);
  if (!name || !name.trim()) return;
  const id = newPlaylistId();
  state.playlists[id] = {
    id,
    name: name.trim(),
    section: state.section,
    ids: [...state.selectedIds],
    created: Date.now(),
  };
  savePlaylists();
  toggleSelectMode(false);
  renderPlaylists();
  activatePlaylist(id);
}

/* -------- navigation -------- */
function navTo(delta) {
  if (state.selectedIdx < 0) return;
  const next = state.selectedIdx + delta;
  if (next < 0 || next >= state.filtered.length) return;
  selectQuestion(state.filtered[next].questionId);
}
function updateNavButtons() {
  const idx = state.selectedIdx;
  const max = state.filtered.length;
  $('#prev-btn').disabled = !(idx > 0);
  $('#next-btn').disabled = !(idx >= 0 && idx < max - 1);
  $('#position-pill').textContent = idx >= 0
    ? `Question ${idx + 1} of ${max}`
    : `${max} in playlist`;
}

/* -------- helpers -------- */
function letterFor(i) { return String.fromCharCode(65 + i); }
function normalizeSpr(v) {
  if (v == null) return '';
  return String(v).trim().replace(/^\./, '0.').replace(/\s+/g, '');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* -------- bindings -------- */
function bind() {
  $('#search-id').addEventListener('input', (e) => {
    state.filters.search = e.target.value;
    applyFilters();
  });
  $('#reveal-answer').addEventListener('click', () => {
    const el = $('#q-answer');
    el.hidden = false;
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([el]).catch(() => {});
    }
  });
  $('#reveal-rationale').addEventListener('click', () => {
    const el = $('#q-rationale');
    el.hidden = false;
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([el]).catch(() => {});
    }
  });
  $('#random-btn').addEventListener('click', () => {
    if (!state.filtered.length) return;
    const pick = state.filtered[Math.floor(Math.random() * state.filtered.length)];
    selectQuestion(pick.questionId);
  });
  $('#clear-btn').addEventListener('click', () => {
    state.filters.search = '';
    state.filters.domains.clear();
    state.filters.difficulties.clear();
    state.filters.skills.clear();
    state.filters.statuses.clear();
    state.filters.markedOnly = false;
    $('#search-id').value = '';
    $$('.pill.active').forEach((p) => p.classList.remove('active'));
    $('#ps-marked-pill').classList.remove('active');
    $$('.cat-checkbox.checked').forEach((cb) => { cb.classList.remove('checked'); cb.textContent = ''; });
    $$('.cat-skill.active').forEach((s) => s.classList.remove('active'));
    applyFilters();
  });
  $('#reset-progress-btn').addEventListener('click', () => {
    if (!confirm('Erase all saved answers? This cannot be undone.')) return;
    state.progress = {};
    saveProgress();
    refreshProgressUI();
    applyFilters();
  });
  $('#prev-btn').addEventListener('click', () => navTo(-1));
  $('#next-btn').addEventListener('click', () => navTo(+1));

  $('#submit-btn').addEventListener('click', () => gradeAnswer());
  $('#retry-btn').addEventListener('click', () => retryQuestion());
  $('#toggle-desmos').addEventListener('click', () => toggleDesmos());
  $('#close-desmos').addEventListener('click', () => toggleDesmos());
  bindDesmosResize();

  $('#save-filter-as-playlist').addEventListener('click', () => saveCurrentFilterAsPlaylist());
  $('#toggle-select-mode').addEventListener('click', () => toggleSelectMode(!state.selectMode));
  $('#select-all-visible').addEventListener('click', () => selectAllVisible());
  $('#save-selection').addEventListener('click', () => saveSelectionAsPlaylist());
  $('#cancel-select').addEventListener('click', () => toggleSelectMode(false));
  $('#exit-playlist').addEventListener('click', () => exitPlaylist());

  // Section toggle (Math / R&W)
  $$('#section-switch button').forEach((b) => {
    b.classList.toggle('active', b.dataset.section === state.section);
    b.addEventListener('click', () => switchSection(b.dataset.section));
  });

  // Submit on Enter when SPR input is focused
  $('#spr-attempt').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); gradeAnswer(); }
  });

  $('#bb-mark').addEventListener('click', () => {
    if (!state.selected) return;
    const cur = state.progress[state.selected] || { status: 'unattempted' };
    cur.marked = !cur.marked;
    state.progress[state.selected] = cur;
    saveProgress();
    $('#bb-mark').classList.toggle('marked', cur.marked);
    refreshProgressUI();
    if (state.filters.markedOnly) applyFilters();
  });

  const setSidebar = (hidden) => {
    document.querySelector('.app').classList.toggle('no-sidebar', hidden);
    $('#show-sidebar').hidden = !hidden;
    localStorage.setItem('sat-sidebar-hidden', hidden ? '1' : '0');
  };
  $('#toggle-sidebar').addEventListener('click', () => setSidebar(true));
  $('#show-sidebar').addEventListener('click', () => setSidebar(false));
  // Restore prior preference
  if (localStorage.getItem('sat-sidebar-hidden') === '1') setSidebar(true);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); navTo(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); navTo(+1); }
    else if (e.key === '\\') {
      e.preventDefault();
      const hidden = document.querySelector('.app').classList.contains('no-sidebar');
      setSidebar(!hidden);
    }
  });
}

bind();
loadIndex();

// Test hook for verify.mjs
window.__test_selectQuestion = async (qid) => {
  if (!state.index.length) await new Promise((r) => setTimeout(r, 200));
  return selectQuestion(qid);
};
