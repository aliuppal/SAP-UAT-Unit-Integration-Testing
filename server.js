/* TestOrbit for SAP – static file server + scenario API backed by Neon Postgres.
 * Run: npm start   (reads DATABASE_URL from .env via node --env-file) */
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');

const PORT = Number(process.env.PORT) || 5180;
const ROOT = __dirname;
const MAX_BODY = 5 * 1024 * 1024;

// Only these files are ever served; .env, server.js and package files stay private.
const STATIC = /^\/(index\.html|styles\.css|js\/[a-z-]+\.js)$/;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30000 })
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

async function initDb() {
  if (!pool) { console.warn('DATABASE_URL not set: API disabled, app falls back to browser storage.'); return; }
  await pool.query(SCHEMA);
  console.log('Connected to Postgres; schema ready.');
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function readJson(req) {
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

async function api(req, res, url) {
  if (!pool) return send(res, 503, { error: 'Database not configured' });

  if (req.method === 'GET' && url.pathname === '/api/health') {
    await pool.query('select 1');
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/state') {
    const [sc, st] = await Promise.all([
      pool.query('select data from scenarios order by updated_at, id'),
      pool.query("select value from app_settings where key = 'project'"),
    ]);
    return send(res, 200, { scenarios: sc.rows.map(r => r.data), project: st.rows[0] ? st.rows[0].value : null });
  }

  // Full replace: upsert every scenario in the payload, delete the rest.
  if (req.method === 'PUT' && url.pathname === '/api/scenarios') {
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

  if (req.method === 'PUT' && url.pathname === '/api/project') {
    const p = await readJson(req);
    if (!p || typeof p !== 'object') return send(res, 400, { error: 'Expected an object' });
    const value = { name: String(p.name || '').slice(0, 200), release: String(p.release || '').slice(0, 200) };
    await pool.query(`insert into app_settings (key, value) values ('project', $1)
      on conflict (key) do update set value = excluded.value, updated_at = now()`, [value]);
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'Not found' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'Method not allowed' });
    const p = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!STATIC.test(p)) return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    const file = await fs.readFile(path.join(ROOT, p));
    return send(res, 200, file, TYPES[path.extname(p)]);
  } catch (e) {
    if (e.code === 'ENOENT') return send(res, 404, 'Not found', 'text/plain; charset=utf-8');
    console.error(e);
    return send(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
  }
});

initDb()
  .catch(e => console.error('Database init failed; API calls will error until it is reachable:', e.message))
  .finally(() => server.listen(PORT, () => console.log(`TestOrbit for SAP running at http://localhost:${PORT}`)));
