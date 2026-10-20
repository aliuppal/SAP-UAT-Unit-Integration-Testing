/* Scenario generation: guidance parsing, built-in library engine, and
 * optional AI engine (OpenRouter, free models only). */

const RULES = [
  { tag: 'negative',     label: 'Negative tests',       re: /negative|invalid|error|fail|reject|blocked/i },
  { tag: 'boundary',     label: 'Boundary / tolerance', re: /boundary|tolerance|threshold|limit|edge|variance/i },
  { tag: 'tax',          label: 'Tax',                  re: /\btax|\bvat\b|\bgst\b|mwst|withholding/i },
  { tag: 'currency',     label: 'Foreign currency',     re: /currency|\bfx\b|exchange rate|multi-?currency/i },
  { tag: 'intercompany', label: 'Intercompany',         re: /inter-?company|cross[- ]company/i },
  { tag: 'auth',         label: 'Authorization / SoD',  re: /authori[sz]|\broles?\b|\bsod\b|segregation|permission|access/i },
  { tag: 'approval',     label: 'Approval / release',   re: /approv|release strateg|workflow/i },
];

const DATA_PATTERNS = {
  cocode:     /(?:company code|co\.?\s?code|cocode)\s*[:#]?\s*(\w{4})/i,
  plant:      /plant\s*[:#]?\s*(\w{4})/i,
  sorg:       /sales org(?:anization)?\s*[:#]?\s*(\w{4})/i,
  porg:       /purch(?:asing)? org(?:anization)?\s*[:#]?\s*(\w{4})/i,
  supplier:   /(?:supplier|vendor)\s*[:#]?\s*([A-Z0-9][\w-]*\d[\w-]*)/i,
  customer:   /customer\s*[:#]?\s*([A-Z0-9][\w-]*\d[\w-]*)/i,
  material:   /material\s*[:#]?\s*([A-Z0-9][\w-]*\d[\w-]*)/i,
  costcenter: /cost cent(?:er|re)\s*[:#]?\s*([A-Z0-9][\w-]*\d[\w-]*)/i,
  equipment:  /equipment\s*[:#]?\s*([A-Z0-9][\w-]*\d[\w-]*)/i,
  taxcode:    /tax code\s*[:#]?\s*(\w{1,3})/i,
};

const ALL_TCODES = new Set(Object.values(TX).flatMap(t => t.gui.split(/[\s/()]+/).filter(c => /^[A-Z]{2,5}\d*[A-Z]?$|^F-\d+$/.test(c) && (c.length >= 4 || /\d/.test(c)))));

const DATA_LABELS = { cocode: 'Company code', plant: 'Plant', porg: 'Purch. org', sorg: 'Sales org', supplier: 'Supplier', customer: 'Customer', material: 'Material', costcenter: 'Cost center', equipment: 'Equipment', taxcode: 'Tax code', fxcurrency: 'Currency' };
const FLOW_DATA = { P2P: ['cocode', 'plant', 'porg', 'supplier', 'material'], O2C: ['cocode', 'sorg', 'customer', 'material'], MFG: ['cocode', 'plant', 'material'], INV: ['cocode', 'plant', 'material'], R2R: ['cocode', 'costcenter'], MAINT: ['plant', 'equipment', 'costcenter'] };
const MODULE_DATA = { FI: ['cocode', 'supplier', 'customer', 'costcenter'], CO: ['cocode', 'costcenter'], MM: ['plant', 'porg', 'supplier', 'material'], SD: ['sorg', 'customer', 'material'], PP: ['plant', 'material'], QM: ['plant', 'material'], PM: ['plant', 'equipment'] };

function parseGuidance(text) {
  const t = text || '';
  const tags = new Set(RULES.filter(r => r.re.test(t)).map(r => r.tag));
  const positiveOnly = /positive only|happy path only|no negative/i.test(t);
  if (positiveOnly) tags.delete('negative');
  const data = {};
  for (const [k, re] of Object.entries(DATA_PATTERNS)) {
    const m = t.match(re);
    if (m) data[k] = m[1];
  }
  const fx = t.match(/\b(USD|EUR|GBP|INR|PKR|AED|SAR|JPY|CNY|CHF|CAD|AUD)\b/);
  if (fx) data.fxcurrency = fx[1];
  const tcodes = [...new Set((t.toUpperCase().match(/\bF-\d+\b|\b[A-Z][A-Z0-9]{2,7}\b/g) || []).filter(c => ALL_TCODES.has(c)))];
  return { tags, data, tcodes, positiveOnly };
}

function fill(str, d) {
  return str.replace(/\{(\w+)\}/g, (_, k) => d[k] || `<${DATA_LABELS[k] || k}>`);
}

function txLabel(key, env) {
  const t = TX[key];
  return t ? t[env] : key;
}

function testDataLine(d, keys) {
  return keys.map(k => `${DATA_LABELS[k]}: ${d[k] || 'TBD'}`).join(' | ');
}

function activeTags(parsed, opts) {
  const tags = new Set(parsed.tags);
  if (opts.negative && !parsed.positiveOnly) tags.add('negative');
  if (opts.boundary) tags.add('boundary');
  return tags;
}

function mkScenario(base) {
  return Object.assign({
    id: '', status: 'Draft', tester: '', defect: '', comments: '', priority: 'Medium',
    polarity: 'Positive', source: 'Library', createdAt: new Date().toISOString(),
  }, base);
}

function touchesFocus(steps, tcodes) {
  return tcodes.length > 0 && steps.some(s => tcodes.some(c => (s.tcode || '').includes(c)));
}

function describeRules(tags, parsed) {
  const parts = RULES.filter(r => tags.has(r.tag)).map(r => r.label);
  if (parsed.tcodes.length) parts.push('Focus: ' + parsed.tcodes.join(', '));
  return parts.length ? 'Guidance applied: ' + parts.join('; ') : '';
}

/* ---------- Built-in engine ---------- */
function generateLibrary(cfg) {
  const { env, type, modules, flows, guidance, opts } = cfg;
  const parsed = parseGuidance(guidance);
  const tags = activeTags(parsed, opts);
  const d = Object.assign({ taxcode: 'V1', fxcurrency: 'USD' }, DEFAULT_DATA[env], parsed.data);
  const ruleNote = describeRules(tags, parsed);
  const authExp = GENERIC_VARIANTS[0].expected[env];
  const out = [];

  if (type === 'Integration') {
    for (const key of flows) {
      const f = FLOWS[key];
      if (!f) continue;
      const steps = f.steps.map((s, i) => ({ seq: (i + 1) * 10, tcode: txLabel(s[0], env), module: s[1], role: s[2], action: fill(s[3], d), expected: fill(s[4], d) }));
      out.push(mkScenario({
        type, env, process: f.name, modules: f.span, key,
        title: `${f.name} end-to-end: ${f.span.join(' → ')}`,
        objective: `Validate document flow and financial postings across ${f.span.join(', ')} from ${steps[0].tcode} to ${steps[steps.length - 1].tcode}.`,
        preconditions: 'Master data maintained and extended to org units; posting periods open; test user has required business roles.',
        testData: testDataLine(d, FLOW_DATA[key]),
        steps, expected: steps[steps.length - 1].expected, priority: 'High', notes: ruleNote,
      }));
      for (const v of f.variants) {
        if (tags.has(v.tag)) out.push(variantScenario(f, key, steps, v, d, env, ruleNote));
      }
      if (tags.has('auth')) {
        const s = steps[Math.min(1, steps.length - 1)];
        out.push(mkScenario({
          type, env, process: f.name, modules: f.span, key, polarity: 'Negative',
          title: `${f.name}: missing authorization for ${s.role}`,
          objective: `Segregation of duties: a user without the ${s.role} role cannot perform ${s.tcode}.`,
          preconditions: `Test user assigned all flow roles except ${s.role}.`,
          testData: testDataLine(d, FLOW_DATA[key]),
          steps: [{ seq: 10, tcode: s.tcode, module: s.module, role: 'Unauthorized user', action: `Attempt: ${s.action}`, expected: authExp }],
          expected: authExp, notes: ruleNote,
        }));
      }
    }
  }

  if (type === 'UAT') {
    for (const m of modules) {
      for (const u of UAT[m] || []) {
        if (u.tag && !tags.has(u.tag)) continue;
        const steps = u.steps.map((s, i) => ({ seq: (i + 1) * 10, tcode: txLabel(s[0], env), module: m, role: u.role, action: fill(s[1], d), expected: fill(s[2], d) }));
        out.push(mkScenario({
          type, env, process: MODULES[m], modules: [m], key: m,
          title: u.title,
          objective: `As ${u.role}, confirm the business process works as designed.`,
          preconditions: `Business user with ${u.role} role; master data available.`,
          testData: testDataLine(d, MODULE_DATA[m]),
          steps, expected: u.acceptance,
          polarity: u.tag === 'negative' ? 'Negative' : u.tag === 'boundary' ? 'Boundary' : 'Positive',
          priority: touchesFocus(steps, parsed.tcodes) || !u.tag ? 'High' : 'Medium',
          status: 'Ready for UAT', notes: ruleNote,
        }));
      }
      const first = (UAT[m] || [])[0];
      if (tags.has('auth') && first) {
        out.push(mkScenario({
          type, env, process: MODULES[m], modules: [m], key: m, polarity: 'Negative',
          title: `Access denied without ${first.role} role`,
          objective: `Verify a user without the ${first.role} role cannot execute the process.`,
          preconditions: `Test user lacking the ${first.role} role.`,
          testData: testDataLine(d, MODULE_DATA[m]),
          steps: [{ seq: 10, tcode: txLabel(first.steps[0][0], env), module: m, role: 'Unauthorized user', action: `Attempt: ${fill(first.steps[0][1], d)}`, expected: authExp }],
          expected: authExp, status: 'Ready for UAT', notes: ruleNote,
        }));
      }
    }
  }

  if (type === 'Unit') {
    const list = [];
    for (const m of modules) for (const u of UNIT[m] || []) list.push([m, u]);
    if (env === 'cloud' && list.length) list.push([modules[0], CLOUD_UNIT_EXTRA]);
    for (const [m, u] of list) {
      if (u.tag && !tags.has(u.tag)) continue;
      const obj = u.object[env] || u.object.cloud;
      const tool = txLabel(u === CLOUD_UNIT_EXTRA ? 'ATC' : 'UNIT_RUN', env);
      out.push(mkScenario({
        type, env, process: `${MODULES[m]} – custom code`, modules: [m], key: m,
        title: u.title,
        objective: `Unit-test ${obj}.`,
        preconditions: env === 'cloud'
          ? 'ABAP Cloud development in ADT (developer extensibility) or key-user custom logic; test doubles for released APIs.'
          : 'Local test class (FOR TESTING, RISK LEVEL HARMLESS); test doubles via CL_ABAP_TESTDOUBLE / CL_OSQL_TEST_ENVIRONMENT.',
        testData: `Object: ${obj}`,
        steps: [
          { seq: 10, tcode: tool, module: m, role: 'Developer', action: `Arrange (Given): ${u.given}`, expected: 'Fixture and test doubles set up.' },
          { seq: 20, tcode: tool, module: m, role: 'Developer', action: `Act (When): ${u.when}`, expected: 'Executes without runtime error.' },
          { seq: 30, tcode: tool, module: m, role: 'Developer', action: `Assert (Then): ${u.then}`, expected: u.then },
        ],
        expected: u.then,
        polarity: u.tag === 'negative' ? 'Negative' : u.tag === 'boundary' ? 'Boundary' : 'Positive',
        priority: u.tag ? 'Medium' : 'High', notes: ruleNote,
      }));
    }
  }
  return out;
}

function variantScenario(f, key, baseSteps, v, d, env, ruleNote) {
  const steps = baseSteps.slice(0, v.at + 1).map(s => Object.assign({}, s));
  const last = steps[steps.length - 1];
  last.action = fill(v.action, d);
  last.expected = fill(v.expected, d);
  return mkScenario({
    type: 'Integration', env, process: f.name, modules: f.span, key,
    title: `${f.name}: ${v.title}`,
    objective: `Deviation at ${last.tcode}: verify the system response and that no inconsistent follow-on documents are created.`,
    preconditions: 'As for the end-to-end scenario, plus the condition described in the final step.',
    testData: testDataLine(d, FLOW_DATA[key]),
    steps, expected: last.expected,
    polarity: v.tag === 'negative' || v.tag === 'approval' ? 'Negative' : 'Boundary',
    priority: 'Medium', notes: ruleNote,
  });
}

/* ---------- AI engine (OpenRouter, free models only) ---------- */
const OR_BASE = 'https://openrouter.ai/api/v1';

async function listFreeModels() {
  const res = await fetch(`${OR_BASE}/models`);
  if (!res.ok) throw new Error(`Model list request failed (${res.status})`);
  const json = await res.json();
  return (json.data || []).filter(m => m.id.endsWith(':free'))
    .map(m => ({ id: m.id, name: m.name, ctx: m.context_length }))
    .sort((a, b) => (b.ctx || 0) - (a.ctx || 0));
}

async function generateAI(cfg, ai) {
  const models = [ai.model, ...(ai.fallbacks || [])].filter(Boolean);
  if (!ai.key) throw new Error('Add an OpenRouter API key in AI settings.');
  if (!models.length) throw new Error('Pick a free model in AI settings.');
  if (models.some(m => !m.endsWith(':free'))) throw new Error('Only free OpenRouter models (ids ending in :free) are allowed.');

  const { env, type, modules, flows, guidance, opts } = cfg;
  const envName = env === 'cloud' ? 'SAP S/4HANA Public Cloud (Fiori apps, clean core, ABAP Cloud)' : 'SAP GUI (classic transaction codes, ECC / S/4HANA on-premise)';
  const scope = type === 'Integration'
    ? 'Integration flows: ' + flows.map(k => `${FLOWS[k].name} (${FLOWS[k].span.join('→')})`).join(', ')
    : 'Modules: ' + modules.map(m => `${m} – ${MODULES[m]}`).join(', ');
  const kind = {
    UAT: 'User Acceptance Test scenarios written for business users',
    Integration: 'cross-module integration test scenarios that verify document flow and postings between modules',
    Unit: 'ABAP unit test cases (Arrange/Act/Assert) for custom code and extensions',
  }[type];
  const stepTool = type === 'Unit'
    ? `"${txLabel('UNIT_RUN', env)}"`
    : (env === 'cloud' ? 'the Fiori app name' : 'the SAP GUI transaction code');

  const user = `Generate 6 to 10 ${kind} for ${envName}.
${scope}.
Include negative tests: ${opts.negative ? 'yes' : 'no'}. Include boundary/tolerance tests: ${opts.boundary ? 'yes' : 'no'}.
User guidance (highest priority):
"""${guidance || 'none'}"""
In each step, "tcode" must be ${stepTool}. Do not invent Fiori app IDs; use app names.
Return a JSON array; each item:
{"title":string,"objective":string,"modules":[module codes like "MM"],"polarity":"Positive"|"Negative"|"Boundary","priority":"High"|"Medium"|"Low","preconditions":string,"testData":string,"steps":[{"tcode":string,"module":string,"role":string,"action":string,"expected":string}],"expected":string}`;

  const res = await fetch(`${OR_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${ai.key}`, 'Content-Type': 'application/json', 'X-Title': 'TestOrbit for SAP' },
    body: JSON.stringify({
      model: models[0],
      models: models.slice(0, 3),
      messages: [
        { role: 'system', content: 'You are a senior SAP QA test architect. Output ONLY valid JSON, no prose, no markdown fences.' },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
      reasoning: { effort: 'low', exclude: true },
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json.error && json.error.message) || `HTTP ${res.status}`;
    if (/free-models-per-day/i.test(msg)) throw new Error('Daily free-model limit reached on OpenRouter (resets 00:00 UTC). Use the built-in library meanwhile.');
    if (res.status === 429) throw new Error('Free model is rate-limited right now. Retry shortly or pick another free model.');
    throw new Error(msg);
  }
  const text = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  if (!text) throw new Error('The model returned an empty response. Try another free model.');
  const usedModel = json.model || models[0];
  const fallbackModules = type === 'Integration' ? FLOWS[flows[0]].span : modules;

  return extractJsonArray(text).map(x => {
    const mods = Array.isArray(x.modules) && x.modules.length ? x.modules.map(String) : fallbackModules;
    return mkScenario({
      type, env, source: `AI (${usedModel})`,
      process: type === 'Integration' ? flows.map(k => FLOWS[k].name).join(', ') : mods.map(m => MODULES[m] || m).join(', '),
      modules: mods,
      key: type === 'Integration' ? flows[0] : mods[0],
      title: String(x.title || 'Untitled scenario'),
      objective: String(x.objective || ''),
      preconditions: String(x.preconditions || ''),
      testData: String(x.testData || ''),
      steps: (Array.isArray(x.steps) ? x.steps : []).map((s, i) => ({ seq: (i + 1) * 10, tcode: String(s.tcode || ''), module: String(s.module || ''), role: String(s.role || ''), action: String(s.action || ''), expected: String(s.expected || '') })),
      expected: String(x.expected || ''),
      polarity: ['Positive', 'Negative', 'Boundary'].includes(x.polarity) ? x.polarity : 'Positive',
      priority: ['High', 'Medium', 'Low'].includes(x.priority) ? x.priority : 'Medium',
      status: type === 'UAT' ? 'Ready for UAT' : 'Draft',
      notes: guidance ? 'Generated by AI from guidance' : '',
    });
  });
}

function extractJsonArray(text) {
  const cleaned = text.replace(/```(?:json)?/g, '');
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start !== -1 && end > start) {
    const arr = JSON.parse(cleaned.slice(start, end + 1));
    if (Array.isArray(arr) && arr.length) return arr;
  }
  const obj = JSON.parse(cleaned.slice(cleaned.indexOf('{'), cleaned.lastIndexOf('}') + 1));
  if (Array.isArray(obj.scenarios) && obj.scenarios.length) return obj.scenarios;
  throw new Error('Model response did not contain a scenario list.');
}
