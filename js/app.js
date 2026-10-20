/* UI state, rendering and event wiring. */

const STATUSES = ['Draft', 'Ready for UAT', 'In Progress', 'Passed', 'Failed', 'Blocked'];
const STEP_RESULTS = ['Not Run', 'Pass', 'Fail', 'Blocked'];
const STATUS_COLOR = { 'Draft': '#94A3B8', 'Ready for UAT': '#0369A1', 'In Progress': '#38BDF8', 'Passed': '#15803D', 'Failed': '#B91C1C', 'Blocked': '#B45309' };
const ID_PREFIX = { UAT: 'UAT', Integration: 'INT', Unit: 'UT' };
const STORE_KEY = 'testorbit.v1';

const store = {
  load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } },
  save(data) { try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch { /* storage unavailable: session-only */ } },
};

const saved = store.load();
const state = {
  env: saved.env || 'cloud',
  type: saved.type || 'Integration',
  modules: new Set(saved.modules || ['MM', 'FI']),
  flows: new Set(saved.flows || ['P2P']),
  guidance: saved.guidance || '',
  opts: saved.opts || { negative: true, boundary: true },
  mode: saved.mode || 'library',
  ai: saved.ai || { key: '', model: '', fallbacks: [] },
  project: saved.project || { name: '', release: '' },
  scenarios: saved.scenarios || [],
  view: 'All',
  filter: { q: '', env: 'All', status: 'All', module: 'All' },
  selected: new Set(),
  open: new Set(),
  busy: false,
  storage: 'browser', // 'browser' | 'server' | 'server-error'
};

function persist() {
  store.save({
    env: state.env, type: state.type, modules: [...state.modules], flows: [...state.flows], guidance: state.guidance,
    opts: state.opts, mode: state.mode, ai: state.ai, project: state.project, scenarios: state.scenarios,
  });
  if (state.storage !== 'browser') scheduleSync();
}

/* ---------- Server sync (Neon Postgres via server.js) ---------- */
let syncTimer, lastSyncedScenarios = '', lastSyncedProject = '';
function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 700);
}

async function putJson(url, body) {
  const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
}

async function syncNow() {
  const sc = JSON.stringify(state.scenarios), pj = JSON.stringify(state.project);
  try {
    if (sc !== lastSyncedScenarios) { await putJson('/api/scenarios', sc); lastSyncedScenarios = sc; }
    if (pj !== lastSyncedProject) { await putJson('/api/project', pj); lastSyncedProject = pj; }
    setStorage('server');
  } catch (e) {
    setStorage('server-error');
    console.warn('Sync failed:', e.message);
  }
}

async function loadFromServer() {
  if (!location.protocol.startsWith('http')) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch('/api/state', { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return;
    const data = await res.json();
    if (data.scenarios.length) {
      state.scenarios = data.scenarios;
      lastSyncedScenarios = JSON.stringify(state.scenarios);
    } else if (state.scenarios.length) {
      toast(`Moved ${state.scenarios.length} scenarios from this browser to the database.`);
    } else {
      lastSyncedScenarios = '[]';
    }
    if (data.project) { state.project = data.project; lastSyncedProject = JSON.stringify(data.project); $('#proj-name').value = data.project.name; $('#proj-release').value = data.project.release; }
    setStorage('server');
    persist();
    renderAll();
  } catch { /* server unreachable: stay on browser storage */ }
}

function setStorage(s) {
  state.storage = s;
  const el = $('#storage-note');
  if (el) el.textContent = { browser: 'Saved in this browser', server: 'Saved to Postgres', 'server-error': 'Database sync failed – retrying on next change' }[s];
}

const $ = sel => document.querySelector(sel);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = id => `<svg class="icon"><use href="#i-${id}"/></svg>`;

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

function banner(kind, msg) {
  $('#banner-slot').innerHTML = msg
    ? `<div class="banner ${kind}">${icon('alert')}<span class="grow">${esc(msg)}</span><button type="button" class="icon-btn" data-dismiss aria-label="Dismiss">${icon('x')}</button></div>`
    : '';
}

/* ---------- IDs ---------- */
function assignIds(list) {
  const max = {};
  for (const s of state.scenarios) {
    const m = /^(.*)-(\d+)$/.exec(s.id || '');
    if (m) max[m[1]] = Math.max(max[m[1]] || 0, Number(m[2]));
  }
  for (const s of list) {
    const base = `${ID_PREFIX[s.type] || 'TC'}-${s.key || (s.modules || [])[0] || 'GEN'}`;
    max[base] = (max[base] || 0) + 1;
    s.id = `${base}-${String(max[base]).padStart(3, '0')}`;
  }
}

/* ---------- Generator panel ---------- */
function renderEnv() {
  document.querySelectorAll('.env-switch button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.env === state.env)));
  $('#gen-sub').textContent = state.env === 'cloud'
    ? 'Steps are written for SAP S/4HANA Public Cloud: Fiori apps, clean core, ABAP Cloud.'
    : 'Steps are written for SAP GUI: classic transaction codes (ECC / S/4HANA on-premise).';
}

function renderType() {
  document.querySelectorAll('#type-tiles .tile').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.type === state.type)));
  renderScope();
}

function renderScope() {
  const scope = $('#scope');
  if (state.type === 'Integration') {
    $('#scope-label').textContent = 'Integration flows';
    $('#scope-hint').textContent = 'Pick one or more cross-module processes.';
    scope.innerHTML = `<div class="flows">${Object.entries(FLOWS).map(([k, f]) => `
      <button type="button" class="flow" data-flow="${k}" aria-pressed="${state.flows.has(k)}">
        <strong><span class="check">${icon('check')}</span>${esc(f.name)}</strong>
        <span class="span">${f.span.join(' → ')} · ${f.steps.length} steps</span>
      </button>`).join('')}</div>`;
  } else {
    $('#scope-label').textContent = 'Modules';
    $('#scope-hint').textContent = state.type === 'Unit' ? 'Custom code and extensions per module.' : 'Pick the modules business users will accept.';
    scope.innerHTML = `<div class="chips">${Object.entries(MODULES).map(([k, n]) => `
      <button type="button" class="chip" data-module="${k}" aria-pressed="${state.modules.has(k)}"><b>${k}</b>${esc(n)}</button>`).join('')}</div>`;
  }
  renderPipeline();
}

function renderPipeline() {
  const el = $('#pipeline');
  if (state.type !== 'Integration' || !state.flows.size) { el.innerHTML = ''; return; }
  const f = FLOWS[[...state.flows][0]];
  const more = state.flows.size > 1 ? ` · +${state.flows.size - 1} more flow${state.flows.size > 2 ? 's' : ''}` : '';
  el.innerHTML = `<div class="pipeline">
    <div class="pipeline-head"><span><strong>${esc(f.name)}</strong> as executed in ${state.env === 'cloud' ? 'Public Cloud' : 'SAP GUI'}${more}</span><span>${f.variants.length} deviation cases available</span></div>
    <div class="pipe">${f.steps.map((s, i) => `${i ? `<span class="pipe-arrow">${icon('arrow')}</span>` : ''}<div class="pipe-step"><span class="m">${s[1]}</span><span class="t">${esc(TX[s[0]][state.env])}</span></div>`).join('')}</div>
  </div>`;
}

function renderDetected() {
  const g = state.guidance;
  $('#char-count').textContent = `${g.length} / 4000`;
  if (!g.trim()) { $('#detected').innerHTML = '<span>Rules and data picked up from your guidance appear here.</span>'; return; }
  const p = parseGuidance(g);
  const parts = [
    ...(p.positiveOnly ? ['<span class="tag">Positive only</span>'] : []),
    ...RULES.filter(r => p.tags.has(r.tag)).map(r => `<span class="tag blue">${esc(r.label)}</span>`),
    ...Object.entries(p.data).map(([k, v]) => `<span class="tag">${esc(DATA_LABELS[k] || k)}: ${esc(v)}</span>`),
    ...p.tcodes.map(c => `<span class="tag">${esc(c)}</span>`),
  ];
  $('#detected').innerHTML = parts.length ? `<span>Detected:</span>${parts.join('')}` : '<span>No rules detected yet. Mention tolerances, negative cases, tax, currency, org units or T-codes.</span>';
}

function renderMode() {
  document.querySelectorAll('.seg [data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
  $('#ai-dot').classList.toggle('on', !!(state.ai.key && state.ai.model));
}

/* ---------- Sidebar ---------- */
function renderNav() {
  const count = t => t === 'All' ? state.scenarios.length : state.scenarios.filter(s => s.type === t).length;
  const items = [['All', 'All scenarios', 'list'], ['UAT', 'User acceptance', 'users'], ['Integration', 'Integration', 'flow'], ['Unit', 'Unit tests', 'code']];
  $('#type-nav').innerHTML = items.map(([k, label, ic]) =>
    `<button type="button" class="nav-item" data-view="${k}" aria-current="${state.view === k}">${icon(ic)}${label}<span class="count">${count(k)}</span></button>`).join('');

  const by = {};
  STATUSES.forEach(s => { by[s] = 0; });
  state.scenarios.forEach(s => { by[s.status] = (by[s.status] || 0) + 1; });
  $('#status-summary').innerHTML = STATUSES.map(s => `<div class="status-row"><span class="swatch" style="background:${STATUS_COLOR[s]}"></span>${s}<span class="n">${by[s]}</span></div>`).join('');
  const total = state.scenarios.length || 1;
  $('#status-bar').innerHTML = state.scenarios.length ? STATUSES.map(s => `<span style="width:${(by[s] / total) * 100}%;background:${STATUS_COLOR[s]}"></span>`).join('') : '';
}

/* ---------- Results table ---------- */
function filtered() {
  const q = state.filter.q.trim().toLowerCase();
  return state.scenarios.filter(s =>
    (state.view === 'All' || s.type === state.view) &&
    (state.filter.env === 'All' || s.env === state.filter.env) &&
    (state.filter.status === 'All' || s.status === state.filter.status) &&
    (state.filter.module === 'All' || (s.modules || []).includes(state.filter.module)) &&
    (!q || [s.id, s.title, s.objective, s.process, s.testData, ...(s.steps || []).map(x => x.tcode)].join(' ').toLowerCase().includes(q)));
}

function renderFilters() {
  $('#f-status').innerHTML = `<option value="All">All statuses</option>` + STATUSES.map(s => `<option ${state.filter.status === s ? 'selected' : ''}>${s}</option>`).join('');
  $('#f-module').innerHTML = `<option value="All">All modules</option>` + Object.keys(MODULES).map(m => `<option value="${m}" ${state.filter.module === m ? 'selected' : ''}>${m}</option>`).join('');
  $('#bulk-status').innerHTML = `<option value="">Set status…</option>` + STATUSES.map(s => `<option>${s}</option>`).join('');
}

function envBadge(env) {
  return env === 'cloud'
    ? `<span class="badge cloud">${icon('cloud')}Public Cloud</span>`
    : `<span class="badge gui">${icon('monitor')}SAP GUI</span>`;
}
function polarityBadge(p) {
  if (p === 'Negative') return '<span class="badge neg">NEGATIVE</span>';
  if (p === 'Boundary') return '<span class="badge bnd">BOUNDARY</span>';
  return '';
}

function renderTable() {
  const rows = filtered();
  const wrap = $('#table-wrap');
  $('#f-meta').textContent = `${rows.length} of ${state.scenarios.length}`;

  if (!state.scenarios.length) {
    wrap.innerHTML = `<div class="empty"><div class="ill">${icon('sheet')}</div><h3>No scenarios yet</h3>
      <p>Choose a test type, select modules or integration flows, add guidance, then generate. You can also import an existing UAT workbook from the Excel Hub.</p>
      <button type="button" class="btn btn-primary" data-act="focus-gen">${icon('play')}Go to generator</button></div>`;
    $('#table-foot').innerHTML = '';
    renderBulk();
    return;
  }
  if (!rows.length) {
    wrap.innerHTML = `<div class="empty"><div class="ill">${icon('search')}</div><h3>No scenarios match these filters</h3>
      <p>Adjust the search text or filters to see more of the ${state.scenarios.length} scenarios.</p>
      <button type="button" class="btn btn-secondary" data-act="reset-filters">Reset filters</button></div>`;
    $('#table-foot').innerHTML = '';
    renderBulk();
    return;
  }

  const allSel = rows.every(s => state.selected.has(s.id));
  wrap.innerHTML = `<table class="matrix">
    <thead><tr>
      <th class="c" style="width:36px"><input type="checkbox" class="cb" data-act="select-all" ${allSel ? 'checked' : ''} aria-label="Select all visible"></th>
      <th style="width:140px">Scenario ID</th>
      <th style="width:130px">Environment</th>
      <th>Scenario &amp; objective</th>
      <th>Test data</th>
      <th>Expected result</th>
      <th class="r" style="width:60px">Steps</th>
      <th style="width:140px">Status</th>
      <th style="width:50px"></th>
    </tr></thead>
    <tbody>${rows.map(rowHtml).join('')}</tbody></table>`;

  const by = t => state.scenarios.filter(s => s.type === t).length;
  $('#table-foot').innerHTML = `<span>UAT ${by('UAT')} · Integration ${by('Integration')} · Unit ${by('Unit')}</span><span id="storage-note"></span>`;
  setStorage(state.storage);
  renderBulk();
}

function rowHtml(s) {
  const open = state.open.has(s.id);
  const sel = state.selected.has(s.id);
  const main = `<tr class="row${open ? ' open' : ''}${sel ? ' selected' : ''}" data-id="${esc(s.id)}">
    <td class="c"><input type="checkbox" class="cb" data-act="select" ${sel ? 'checked' : ''} aria-label="Select ${esc(s.id)}"></td>
    <td><div class="sid">${esc(s.id)}</div><div class="sid-sub">${esc(s.type)} · ${esc((s.modules || []).join('→'))}</div></td>
    <td><div class="badges">${envBadge(s.env)}${polarityBadge(s.polarity)}</div></td>
    <td><div class="t-title">${esc(s.title)}</div><div class="t-obj">${esc(s.objective)}</div></td>
    <td><div class="data">${esc(s.testData).replace(/ \| /g, '<br>')}</div></td>
    <td><div class="expected">${esc(s.expected)}</div></td>
    <td class="r"><span class="nsteps">${(s.steps || []).length}</span></td>
    <td><select class="status-select" data-act="status" data-s="${esc(s.status)}" aria-label="Status of ${esc(s.id)}">${STATUSES.map(x => `<option ${x === s.status ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
    <td class="r"><button type="button" class="icon-btn" data-act="toggle" aria-expanded="${open}" aria-label="Show steps"><svg class="icon chev"><use href="#i-chev"/></svg></button></td>
  </tr>`;
  if (!open) return main;
  return main + `<tr class="detail" data-id="${esc(s.id)}"><td colspan="9">
    <div class="detail-grid">
      <div><h4>Business process</h4><p>${esc(s.process)} · Priority ${esc(s.priority)}</p></div>
      <div><h4>Preconditions</h4><p>${esc(s.preconditions)}</p></div>
      <div><h4>Source</h4><p>${esc(s.source)}${s.notes ? '<br>' + esc(s.notes) : ''}</p></div>
    </div>
    <div class="table-wrap"><table class="steps">
      <thead><tr><th style="width:50px">Step</th><th style="width:190px">${s.env === 'cloud' ? 'Fiori app / tool' : 'T-code / tool'}</th><th style="width:130px">Role</th><th>Action</th><th>Expected result</th><th style="width:180px">Actual result</th><th style="width:100px">Result</th></tr></thead>
      <tbody>${(s.steps || []).map((st, i) => `<tr>
        <td>${esc(st.seq)}</td>
        <td class="tc">${esc(st.tcode)}</td>
        <td>${esc(st.role)}</td>
        <td>${esc(st.action)}</td>
        <td>${esc(st.expected)}</td>
        <td><input data-act="actual" data-step="${i}" value="${esc(st.actual || '')}" aria-label="Actual result step ${esc(st.seq)}"></td>
        <td><select data-act="result" data-step="${i}" aria-label="Result step ${esc(st.seq)}">${STEP_RESULTS.map(r => `<option ${r === (st.result || 'Not Run') ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div class="detail-actions">
      <label>Tester <input class="input" data-act="tester" value="${esc(s.tester)}" placeholder="Name"></label>
      <label>Defect ID <input class="input" data-act="defect" value="${esc(s.defect)}" placeholder="e.g. DEF-101"></label>
      <span style="flex:1"></span>
      <button type="button" class="btn btn-danger btn-sm" data-act="delete">${icon('trash')}Delete scenario</button>
    </div>
  </td></tr>`;
}

function renderBulk() {
  const n = state.selected.size;
  $('#bulk').classList.toggle('show', n > 0);
  $('#bulk-n').textContent = n;
}

function renderAll() {
  renderNav();
  renderTable();
  renderXl();
}

/* ---------- Excel hub ---------- */
function xlScope() {
  const v = document.querySelector('input[name="xl-scope"]:checked').value;
  if (v === 'filtered') return filtered();
  if (v === 'selected') return state.scenarios.filter(s => state.selected.has(s.id));
  return state.scenarios;
}

function renderXl() {
  $('#xl-n-all').textContent = state.scenarios.length;
  $('#xl-n-filtered').textContent = filtered().length;
  $('#xl-n-selected').textContent = state.selected.size;
  const selRadio = document.querySelector('input[name="xl-scope"][value="selected"]');
  selRadio.disabled = !state.selected.size;
  if (selRadio.disabled && selRadio.checked) document.querySelector('input[name="xl-scope"][value="all"]').checked = true;
  const list = xlScope();
  const steps = list.reduce((n, s) => n + (s.steps || []).length, 0);
  const defects = list.filter(s => s.status === 'Failed' || s.defect).length;
  const sheets = [
    ['Cover', '', 'Project, release, environment, guidance used, instructions and sign-off block.'],
    ['Scenarios', list.length, 'One row per scenario: type, environment, modules, objective, test data, expected result, status.'],
    ['Test Steps', steps, 'T-code or Fiori app per step with Actual Result and Pass/Fail columns for testers.'],
    ['Defects', defects, 'Pre-filled for failed scenarios; testers log SAP messages and owners.'],
  ];
  $('#xl-sheets').innerHTML = sheets.map(([n, c, d]) => `<div class="sheet"><strong>${n}${c !== '' ? `<span>${c} rows</span>` : ''}</strong><small>${d}</small></div>`).join('');
  $('#xl-export').disabled = !list.length;
  $('#btn-export-quick').disabled = !state.scenarios.length;
}

function openDrawer(show) {
  $('#excel-drawer').classList.toggle('show', show);
  $('#scrim').classList.toggle('show', show);
  if (show) { renderXl(); $('#btn-close-excel').focus(); }
}

function doExport(list) {
  if (!list.length) { toast('Nothing to export yet.'); return; }
  try {
    const name = exportWorkbook(list, state.project, state.guidance);
    toast(`Downloaded ${name} (${list.length} scenarios).`);
  } catch (e) {
    banner('error', `Excel export failed: ${e.message}${typeof XLSX === 'undefined' ? ' The Excel library did not load; check your connection and reload.' : ''}`);
  }
}

async function handleImport(file) {
  const out = $('#xl-result');
  if (!file) return;
  try {
    const res = importWorkbook(await file.arrayBuffer(), state.scenarios);
    persist();
    renderAll();
    out.innerHTML = `<div class="result-box">Imported ${esc(file.name)}: ${res.updated} scenarios updated, ${res.created} added, ${res.steps} step results read.</div>`;
    toast('Results imported.');
  } catch (e) {
    out.innerHTML = `<div class="result-box err">Could not import ${esc(file.name)}: ${esc(e.message)}</div>`;
  }
}

/* ---------- Generate ---------- */
async function generate() {
  if (state.busy) return;
  const cfg = { env: state.env, type: state.type, modules: [...state.modules], flows: [...state.flows], guidance: state.guidance, opts: state.opts };
  if (state.type === 'Integration' && !cfg.flows.length) { banner('error', 'Select at least one integration flow.'); return; }
  if (state.type !== 'Integration' && !cfg.modules.length) { banner('error', 'Select at least one module.'); return; }
  banner('', '');

  let list;
  if (state.mode === 'ai') {
    if (!state.ai.key || !state.ai.model) { openAiSettings(); toast('Add an OpenRouter key and pick a free model first.'); return; }
    setBusy(true);
    const slow = setTimeout(() => toast('Free models can be slow. Still working…'), 15000);
    try {
      list = await generateAI(cfg, state.ai);
    } catch (e) {
      banner('error', `AI generation failed: ${e.message} Your guidance is kept; switch to Built-in library to generate offline.`);
      return;
    } finally {
      clearTimeout(slow);
      setBusy(false);
    }
  } else {
    try {
      list = generateLibrary(cfg);
    } catch (e) {
      banner('error', `Generation failed: ${e.message}`);
      return;
    }
  }

  if (!list.length) { banner('info', 'No scenarios matched. Enable negative/boundary tests or pick more modules.'); return; }
  assignIds(list);
  state.scenarios.push(...list);
  state.view = 'All';
  state.filter = { q: '', env: 'All', status: 'All', module: 'All' };
  $('#f-q').value = ''; $('#f-env').value = 'All';
  renderFilters();
  persist();
  renderAll();
  toast(`Added ${list.length} ${state.type === 'Unit' ? 'unit test cases' : state.type + ' scenarios'} for ${state.env === 'cloud' ? 'Public Cloud' : 'SAP GUI'}.`);
  $('#res-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setBusy(b) {
  state.busy = b;
  const btn = $('#btn-generate');
  btn.disabled = b;
  btn.innerHTML = b ? '<span class="spinner"></span><span>Generating…</span>' : `${icon('play')}<span>Generate scenarios</span>`;
}

/* ---------- AI settings ---------- */
let modelCache = null;
async function openAiSettings() {
  const dlg = $('#ai-dialog');
  if (dlg.open) return;
  $('#ai-key').value = state.ai.key || '';
  dlg.showModal();
  const sel = $('#ai-model'), fb = $('#ai-fallback'), help = $('#ai-models-help');
  if (!modelCache) {
    sel.innerHTML = '<option value="">Loading free models…</option>';
    try { modelCache = await listFreeModels(); } catch (e) {
      help.textContent = `Could not load the model list (${e.message}). Check your connection and reopen this dialog.`;
      sel.innerHTML = state.ai.model ? `<option>${esc(state.ai.model)}</option>` : '<option value="">Unavailable</option>';
      return;
    }
  }
  if (!modelCache.length) { help.textContent = 'OpenRouter currently lists no free models.'; return; }
  const opts = cur => modelCache.map(m => `<option value="${esc(m.id)}" ${m.id === cur ? 'selected' : ''}>${esc(m.name || m.id)}</option>`).join('');
  sel.innerHTML = opts(state.ai.model || modelCache[0].id);
  fb.innerHTML = '<option value="">None</option>' + opts((state.ai.fallbacks || [])[0]);
  help.textContent = `${modelCache.length} free models available (ids ending in “:free”). If the primary is rate-limited, OpenRouter tries the fallback.`;
}

/* ---------- Events ---------- */
function resetFilters() {
  state.view = 'All';
  state.filter = { q: '', env: 'All', status: 'All', module: 'All' };
  $('#f-q').value = ''; $('#f-env').value = 'All';
  renderFilters(); renderAll();
}

function bind() {
  document.querySelectorAll('.env-switch button').forEach(b => b.addEventListener('click', () => {
    state.env = b.dataset.env; persist(); renderEnv(); renderPipeline();
    toast(`Target set to ${state.env === 'cloud' ? 'SAP S/4HANA Public Cloud (Fiori apps)' : 'SAP GUI (transaction codes)'}.`);
  }));
  $('#type-tiles').addEventListener('click', e => {
    const t = e.target.closest('[data-type]'); if (!t) return;
    state.type = t.dataset.type; persist(); renderType();
  });
  $('#scope').addEventListener('click', e => {
    const f = e.target.closest('[data-flow]'), m = e.target.closest('[data-module]');
    if (f) { const k = f.dataset.flow; state.flows.has(k) ? state.flows.delete(k) : state.flows.add(k); }
    else if (m) { const k = m.dataset.module; state.modules.has(k) ? state.modules.delete(k) : state.modules.add(k); }
    else return;
    persist(); renderScope();
  });
  const g = $('#guidance');
  g.value = state.guidance;
  g.addEventListener('input', () => { state.guidance = g.value; renderDetected(); persist(); });
  document.querySelectorAll('[data-ins]').forEach(b => b.addEventListener('click', () => {
    g.value = (g.value.trim() ? g.value.trim() + ' ' : '') + b.dataset.ins;
    state.guidance = g.value; renderDetected(); persist(); g.focus();
  }));
  $('#opt-negative').checked = state.opts.negative;
  $('#opt-boundary').checked = state.opts.boundary;
  $('#opt-negative').addEventListener('change', e => { state.opts.negative = e.target.checked; persist(); });
  $('#opt-boundary').addEventListener('change', e => { state.opts.boundary = e.target.checked; persist(); });
  document.querySelectorAll('.seg [data-mode]').forEach(b => b.addEventListener('click', () => {
    state.mode = b.dataset.mode; persist(); renderMode();
    if (state.mode === 'ai' && !(state.ai.key && state.ai.model)) openAiSettings();
  }));
  $('#btn-generate').addEventListener('click', generate);
  $('#banner-slot').addEventListener('click', e => { if (e.target.closest('[data-dismiss]')) banner('', ''); });

  $('#type-nav').addEventListener('click', e => {
    const v = e.target.closest('[data-view]'); if (!v) return;
    state.view = v.dataset.view; renderAll();
  });
  const pn = $('#proj-name'), pr = $('#proj-release');
  pn.value = state.project.name; pr.value = state.project.release;
  pn.addEventListener('input', () => { state.project.name = pn.value; persist(); });
  pr.addEventListener('input', () => { state.project.release = pr.value; persist(); });

  $('#f-q').addEventListener('input', e => { state.filter.q = e.target.value; renderTable(); renderXl(); });
  $('#f-env').addEventListener('change', e => { state.filter.env = e.target.value; renderTable(); renderXl(); });
  $('#f-status').addEventListener('change', e => { state.filter.status = e.target.value; renderTable(); renderXl(); });
  $('#f-module').addEventListener('change', e => { state.filter.module = e.target.value; renderTable(); renderXl(); });
  $('#btn-clear-all').addEventListener('click', () => {
    if (!state.scenarios.length) return;
    if (!confirm(`Delete all ${state.scenarios.length} scenarios? Export to Excel first if you need them.`)) return;
    state.scenarios = []; state.selected.clear(); state.open.clear(); persist(); renderAll();
  });

  const wrap = $('#table-wrap');
  wrap.addEventListener('click', e => {
    const actEl = e.target.closest('[data-act]');
    const act = actEl && actEl.dataset.act;
    if (act === 'focus-gen') { $('#type-tiles').scrollIntoView({ behavior: 'smooth' }); return; }
    if (act === 'reset-filters') { resetFilters(); return; }
    if (act === 'select-all') {
      const rows = filtered();
      rows.forEach(s => actEl.checked ? state.selected.add(s.id) : state.selected.delete(s.id));
      renderTable(); renderXl(); return;
    }
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const id = tr.dataset.id;
    if (act === 'select') { actEl.checked ? state.selected.add(id) : state.selected.delete(id); renderTable(); renderXl(); return; }
    if (act === 'delete') {
      state.scenarios = state.scenarios.filter(s => s.id !== id); state.selected.delete(id); state.open.delete(id);
      persist(); renderAll(); toast(`Deleted ${id}.`); return;
    }
    if (act && act !== 'toggle') return; // clicks inside inputs/selects
    if (tr.classList.contains('detail')) return;
    state.open.has(id) ? state.open.delete(id) : state.open.add(id);
    renderTable();
  });
  wrap.addEventListener('change', e => {
    const el = e.target, act = el.dataset.act, tr = el.closest('tr[data-id]');
    if (!tr || !act) return;
    const s = state.scenarios.find(x => x.id === tr.dataset.id); if (!s) return;
    if (act === 'status') { s.status = el.value; el.dataset.s = el.value; }
    else if (act === 'result') s.steps[Number(el.dataset.step)].result = el.value;
    else if (act === 'actual') s.steps[Number(el.dataset.step)].actual = el.value;
    else if (act === 'tester') s.tester = el.value;
    else if (act === 'defect') s.defect = el.value;
    else return;
    persist(); renderNav(); renderXl();
  });

  $('#bulk-status').addEventListener('change', e => {
    if (!e.target.value) return;
    state.scenarios.forEach(s => { if (state.selected.has(s.id)) s.status = e.target.value; });
    toast(`Status set to ${e.target.value} for ${state.selected.size} scenarios.`);
    persist(); renderAll(); renderFilters();
  });
  $('#bulk-export').addEventListener('click', () => doExport(state.scenarios.filter(s => state.selected.has(s.id))));
  $('#bulk-delete').addEventListener('click', () => {
    const n = state.selected.size;
    if (!confirm(`Delete ${n} selected scenarios?`)) return;
    state.scenarios = state.scenarios.filter(s => !state.selected.has(s.id)); state.selected.clear();
    persist(); renderAll(); toast(`Deleted ${n} scenarios.`);
  });
  $('#bulk-clear').addEventListener('click', () => { state.selected.clear(); renderTable(); renderXl(); });

  $('#btn-open-excel').addEventListener('click', () => openDrawer(true));
  $('#btn-close-excel').addEventListener('click', () => openDrawer(false));
  $('#scrim').addEventListener('click', () => openDrawer(false));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#excel-drawer').classList.contains('show')) openDrawer(false); });
  document.querySelectorAll('input[name="xl-scope"]').forEach(r => r.addEventListener('change', renderXl));
  $('#xl-export').addEventListener('click', () => doExport(xlScope()));
  $('#btn-export-quick').addEventListener('click', () => doExport(filtered().length ? filtered() : state.scenarios));
  const tpl = () => { try { toast(`Downloaded ${exportTemplate(state.project)}.`); } catch (e) { banner('error', 'Template download failed: ' + e.message); } };
  $('#xl-template').addEventListener('click', tpl);
  $('#btn-template').addEventListener('click', tpl);
  $('#xl-file').addEventListener('change', e => { handleImport(e.target.files[0]); e.target.value = ''; });
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => handleImport(e.dataTransfer.files[0]));

  $('#btn-ai-settings').addEventListener('click', openAiSettings);
  $('#ai-dialog').addEventListener('close', () => {
    if ($('#ai-dialog').returnValue !== 'save') return;
    const model = $('#ai-model').value, fb = $('#ai-fallback').value;
    if (model && !model.endsWith(':free')) { toast('Only free models are allowed.'); return; }
    state.ai = { key: $('#ai-key').value.trim(), model, fallbacks: fb && fb !== model ? [fb] : [] };
    persist(); renderMode(); toast('AI settings saved.');
  });
}

/* ---------- Boot ---------- */
bind();
renderEnv();
renderType();
renderDetected();
renderMode();
renderFilters();
renderAll();
loadFromServer(); // same-origin GET /api/state; no-op when opened as a file
if (typeof XLSX === 'undefined') banner('error', 'The Excel library could not load (offline?). Generation works, but Excel export/import needs an internet connection.');
