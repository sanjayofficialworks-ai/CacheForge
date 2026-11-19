// CacheForge dev server.
//  - serves the frontend files
//  - forwards /cache/* to the Flask API
//  - starts Flask itself, so the cache size (slots) can be changed from the page
//
// Run: node frontend/serve.js     (or ./start.sh)
//
// No Python file is modified. Flask is launched with a one-line wrapper that
// imports the existing app from main.py and, only when a slot count is chosen
// in the page, swaps in CacheEngine(<slots>). With no slot count, the app runs
// exactly as main.py defines it, using CACHE_CAPACITY from src/config.py.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const API = { host: '127.0.0.1', port: Number(process.env.API_PORT) || 8000 };
const PY = process.env.PY || 'python3';
const MAX_SLOTS = 20;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
};

const WRAPPER = [
  'import sys',
  'from main import app',
  'from src.core import CacheEngine',
  'if len(sys.argv) > 1:',
  '    app.extensions["cache_engine"] = CacheEngine(int(sys.argv[1]))',
  `app.run(host="${API.host}", port=${API.port})`,
].join('\n');

let child = null;
let managed = false;          // true when this script started Flask
let busy = false;             // a restart is in progress
let defaultSlots = null;      // CACHE_CAPACITY read from src/config.py
let current = { slots: null, source: 'config' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readConfigDefault() {
  return new Promise((resolve) => {
    execFile(PY, ['-c', 'from src.config import Config; print(Config.CACHE_CAPACITY)'],
      { cwd: ROOT }, (err, out) => {
        const n = parseInt(out, 10);
        resolve(err || !Number.isInteger(n) ? null : n);
      });
  });
}

function healthy() {
  return new Promise((resolve) => {
    const req = http.get({ ...API, path: '/cache/health', timeout: 800 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function waitHealthy(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await healthy()) return true;
    await sleep(250);
  }
  return false;
}

function startFlask(slots) {
  const args = ['-c', WRAPPER];
  if (slots) args.push(String(slots));
  child = spawn(PY, args, { cwd: ROOT, stdio: 'inherit' });
  managed = true;
  child.on('exit', () => { child = null; });
}

function stopFlask() {
  return new Promise((resolve) => {
    if (!child) return resolve();
    const c = child;
    c.once('exit', resolve);
    c.kill('SIGTERM');
    setTimeout(() => c.kill('SIGKILL'), 2000);
  });
}

function state() {
  return {
    slots: current.slots,
    defaultSlots,
    source: current.source,   // "config" or "custom"
    max: MAX_SLOTS,
    managed,
  };
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve(null); } });
  });
}

async function handleSlots(req, res) {
  if (req.method === 'GET') return send(res, 200, state());
  if (req.method !== 'POST') return send(res, 405, { error: 'Use GET or POST.' });

  const body = await readBody(req);
  if (body === null) return send(res, 400, { error: 'The request body is not valid JSON.' });

  let slots = null;
  if (body.slots !== null && body.slots !== undefined && body.slots !== '') {
    slots = Number(body.slots);
    if (!Number.isInteger(slots) || slots < 1 || slots > MAX_SLOTS) {
      return send(res, 400, { error: `Slots must be a whole number from 1 to ${MAX_SLOTS}.` });
    }
  }
  if (!managed) {
    return send(res, 409, {
      error: 'Flask was already running when this server started, so its size cannot be changed here. Stop it and start everything with ./start.sh.',
    });
  }
  if (busy) return send(res, 409, { error: 'The cache is already restarting. Try again in a moment.' });

  busy = true;
  try {
    await stopFlask();
    startFlask(slots);
    if (!(await waitHealthy(15000))) {
      return send(res, 500, { error: 'Flask did not come back after the restart. Check the terminal for its error.' });
    }
    current = { slots: slots || defaultSlots, source: slots ? 'custom' : 'config' };
    return send(res, 200, { ...state(), message: `Cache restarted with ${current.slots} slots. All keys were cleared.` });
  } finally {
    busy = false;
  }
}

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];

  if (url === '/ui/slots') return void handleSlots(req, res);

  if (req.url.startsWith('/cache')) {
    const upstream = http.request(
      { ...API, path: req.url, method: req.method, headers: { ...req.headers, host: `${API.host}:${API.port}` } },
      (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); }
    );
    upstream.on('error', () => send(res, 502, { error: 'Flask is not reachable on port ' + API.port + '.' }));
    req.pipe(upstream);
    return;
  }

  const name = url === '/' ? 'index.html' : path.basename(url);
  if (!TYPES[path.extname(name)] || name === 'serve.js') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  fs.readFile(path.join(__dirname, name), (err, body) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(name)] });
    res.end(body);
  });
});

function shutdown() {
  if (child) child.kill('SIGTERM');
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', () => { if (child) child.kill('SIGTERM'); });

// CACHE_CAPACITY (environment) sets the starting slot count, e.g. in Docker.
// Empty or unset means "use CACHE_CAPACITY from src/config.py".
function slotsFromEnv() {
  const raw = (process.env.CACHE_CAPACITY || '').trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_SLOTS) {
    console.warn(`Ignoring CACHE_CAPACITY="${raw}": use a whole number from 1 to ${MAX_SLOTS}.`);
    return null;
  }
  return n;
}

(async () => {
  defaultSlots = await readConfigDefault();
  current = { slots: defaultSlots, source: 'config' };
  if (await healthy()) {
    console.log(`Flask is already running on port ${API.port}; slots cannot be changed from the page.`);
    managed = false;
  } else {
    const fromEnv = slotsFromEnv();
    startFlask(fromEnv);
    if (fromEnv) current = { slots: fromEnv, source: 'env' };
  }
  server.listen(PORT, () => console.log(`CacheForge frontend: http://localhost:${PORT}`));
})();
