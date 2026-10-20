/* TestOrbit for SAP – scenario API backed by Postgres (Neon), protected by HTTP Basic auth.
   Local:  npm start   (static files + API on http://localhost:5180, reads .env)
 * Vercel: api/index.js re-exports `handler`; Vercel serves the static files itself. */
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT) || 5180;
const ROOT = path.join(__dirname, '..');
const MAX_BODY = 4 * 1024 * 1024;

// Only these files are served locally; .env, server.js and package files stay private.
const STATIC = /^\/(index\.html|styles\.css|js\/[a-z-]+\.js)$/;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

/* ---------- Auth ---------- */
const AUTH_USER = process.env.BASIC_AUTH_USER || '';
const AUTH_PASS = process.env.BASIC_AUTH_PASS || '';
// Auth is enforced whenever credentials are configured, and always on Vercel (fail closed if unset).
const REQUIRE_AUTH = Boolean(AUTH_USER && AUTH_PASS) || Boolean(process.env.VERCEL);
const MAX_FAILS = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map(); // ip -> { count, first }

function digestEqual(a, b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

/* Returns 'ok' | 'unauthorized' | 'locked' | 'unconfigured'. */
function checkAuth(req) {
  if (!REQUIRE_AUTH) return 'ok';
  if (!AUTH_USER || !AUTH_PASS) return 'unconfigured';
  const ip = clientIp(req);
  const f = failures.get(ip);
  if (f && Date.now() - f.first > FAIL_WINDOW_MS) failures.delete(ip);
  else if (f && f.count >= MAX_FAILS) return 'locked';

  const m = /^Basic\s+([A-Za-z0-9+/=]+)$/i.exec(req.headers.authorization || '');
  let ok = false;
  if (m) {
    const decoded = Buffer.from(m[1], 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    if (i > 0) {
      const userOk = digestEqual(decoded.slice(0, i), AUTH_USER);
      const passOk = digestEqual(decoded.slice(i + 1), AUTH_PASS);
      ok = userOk && passOk;
    }
  }
  if (ok) { failures.delete(ip); return 'ok'; }
  if (m) {
    const cur = failures.get(ip) || { count: 0, first: Date.now() };
    cur.count++;
    failures.set(ip, cur);
  }
  return 'unauthorized';
}

/* ---------- Database ---------- */
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 10000 })
  : null;

const SCHEMA = `
create table if not exists scenarios (
  id          text primary key,
  type        text not null,
  env         text not null,
  modules     text[] not null default '{}',
  title       text not null,
  status      text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
create index if not exists scenarios_type_idx on scenarios (type);
create table if not exists app_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);`;

let schemaReady = null;
function ensureSchema() {
  if (!schemaReady) schemaReady = pool.query(SCHEMA).catch(e => { schemaReady = null; throw e; });
  return schemaReady;
}

/* ---------- HTTP helpers ---------- */
function send(res, status, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(status, Object.assign({ 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }, extra));
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function readJson(req) {
  // On Vercel the runtime may already have parsed the body.
  if (req.body !== undefined && req.body !== null && typeof req.body !== 'string' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    try { return Promise.resolve(JSON.parse(String(req.body) || 'null')); }
    catch { return Promise.reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
  }
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function validScenario(s) {
  return s && typeof s === 'object' && typeof s.id === 'string' && s.id.length > 0 && s.id.length <= 64
    && typeof s.title === 'string' && typeof s.type === 'string' && typeof s.env === 'string';
}

/* ---------- API ---------- */
async function api(req, res, route) {
  const auth = checkAuth(req);
  if (auth === 'unconfigured') return send(res, 503, { error: 'Server auth not configured' });
  if (auth === 'locked') return send(res, 429, { error: 'Too many failed sign-in attempts. Try again later.' });
  if (auth !== 'ok') {
    // The app sends X-TestOrbit so the browser's native Basic prompt is suppressed in favour of the in-app dialog.
    const challenge = req.headers['x-testorbit'] ? {} : { 'WWW-Authenticate': 'Basic realm="TestOrbit", charset="UTF-8"' };
    return send(res, 401, { error: 'Authentication required' }, undefined, challenge);
  }
  if (!pool) return send(res, 503, { error: 'Database not configured' });
  await ensureSchema();

  if (req.method === 'GET' && route === '/api/health') {
    await pool.query('select 1');
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && route === '/api/state') {
    const [sc, st] = await Promise.all([
      pool.query('select data from scenarios order by updated_at, id'),
      pool.query("select value from app_settings where key = 'project'"),
    ]);
    return send(res, 200, { scenarios: sc.rows.map(r => r.data), project: st.rows[0] ? st.rows[0].value : null });
  }

  // Full replace: upsert every scenario in the payload, delete the rest.
  if (req.method === 'PUT' && route === '/api/scenarios') {
    const list = await readJson(req);
    if (!Array.isArray(list) || !list.every(validScenario)) return send(res, 400, { error: 'Expected an array of scenarios with id, type, env, title' });
    const client = await pool.connect();
    try {
      await client.query('begin');
      if (list.length) {
        await client.query(`
          insert into scenarios (id, type, env, modules, title, status, data, updated_at)
          select e->>'id', e->>'type', e->>'env',
                 coalesce(array(select jsonb_array_elements_text(coalesce(e->'modules', '[]'::jsonb))), '{}'),
                 e->>'title', coalesce(e->>'status', 'Draft'), e, now()
          from jsonb_array_elements($1::jsonb) e
          on conflict (id) do update set
            type = excluded.type, env = excluded.env, modules = excluded.modules, title = excluded.title,
            status = excluded.status, data = excluded.data, updated_at = now()
          where scenarios.data is distinct from excluded.data`, [JSON.stringify(list)]);
      }
      await client.query('delete from scenarios where not (id = any($1::text[]))', [list.map(s => s.id)]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback');
      throw e;
    } finally {
      client.release();
    }
    return send(res, 200, { ok: true, count: list.length });
  }

  if (req.method === 'PUT' && route === '/api/project') {
    const p = await readJson(req);
    if (!p || typeof p !== 'object') return send(res, 400, { error: 'Expected an object' });
    const value = { name: String(p.name || '').slice(0, 200), release: String(p.release || '').slice(0, 200) };
    await pool.query(`insert into app_settings (key, value) values ('project', $1)
      on conflict (key) do update set value = excluded.value, updated_at = now()`, [value]);
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'Not found' });
}

async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  // Vercel rewrites /api/<route> to /api/index?route=<route>.
  const rewritten = url.searchParams.get('route');
  const route = rewritten ? `/api/${rewritten.replace(/^\/+/, '')}` : url.pathname;
  try {
    if (route.startsWith('/api/')) return await api(req, res, route);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
    const p = route === '/' ? '/index.html' : route;
    if (!STATIC.test(p)) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    const file = await fs.readFile(path.join(ROOT, p));
    return send(res, 200, file, TYPES[path.extname(p)]);
  } catch (e) {
    if (e.code === 'ENOENT') return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    console.error(e);
    return send(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
  }
}

module.exports = { handler };

if (require.main === module) {
  if (!pool) console.warn('DATABASE_URL not set: API returns 503; the app falls back to browser storage.');
  if (!REQUIRE_AUTH) console.warn('BASIC_AUTH_USER / BASIC_AUTH_PASS not set: API is unauthenticated (local use only).');
  http.createServer(handler).listen(PORT, () => console.log(`TestOrbit for SAP running at http://localhost:${PORT}`));
}
