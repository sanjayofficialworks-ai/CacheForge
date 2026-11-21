(() => {
  'use strict';

  // Number of slots. Loaded from the server (GET /ui/slots): the value typed in
  // this page if there is one, otherwise CACHE_CAPACITY from src/config.py.
  let CAPACITY = 3;
  const STACK_ABOVE = 4;   // more slots than this run top to bottom
  const MAX_LOG = 40;

  // Cooled steel -> mid heat -> molten amber. Must match --cold, --mid, --hot in styles.css.
  const STOPS = { cold: [147, 157, 166], mid: [240, 112, 42], hot: [255, 176, 46] };

  const $ = (sel) => document.querySelector(sel);
  const rail = $('#rail');
  const countEl = $('#count');
  const hintEl = $('#hint');
  const logEl = $('#log');
  const logEmpty = $('#log-empty');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // The server has no "list keys" endpoint, so this page mirrors the cache from
  // the requests it sends. Order is coldest (next to evict) first, hottest last.
  const order = [];
  const ingots = new Map();
  const logs = [];

  /* ---------- rail ---------- */

  const forge = $('#forge');
  const narrow = window.matchMedia('(max-width: 900px)');

  function layout() {
    forge.classList.toggle('stack', narrow.matches || CAPACITY > STACK_ABOVE);
  }
  narrow.addEventListener('change', layout);

  // Empties the mirror and redraws the empty slots for the current CAPACITY.
  function buildRail() {
    order.length = 0;
    ingots.clear();
    rail.style.setProperty('--n', CAPACITY);
    const slotEls = [];
    for (let i = 0; i < CAPACITY; i++) {
      const slot = document.createElement('div');
      slot.className = 'slot';
      slot.style.setProperty('--i', i);
      slot.textContent = 'Empty slot';
      slotEls.push(slot);
    }
    rail.replaceChildren(...slotEls);
    layout();
  }

  function heat(t) {
    const [a, b, u] = t < 0.5
      ? [STOPS.cold, STOPS.mid, t / 0.5]
      : [STOPS.mid, STOPS.hot, (t - 0.5) / 0.5];
    return a.map((v, i) => Math.round(v + (b[i] - v) * u));
  }

  function show(value) {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  function createIngot(key) {
    const el = document.createElement('article');
    el.className = 'ingot pour';
    el.dataset.key = key;
    el.innerHTML =
      '<div class="k"></div>' +
      '<div class="v"></div>' +
      '<div class="foot">' +
        '<span class="chip" hidden>Evicted next</span>' +
        '<span class="acts">' +
          '<button class="mini" type="button" data-act="read">Read</button>' +
          '<button class="mini" type="button" data-act="delete">Delete</button>' +
        '</span>' +
      '</div>';
    el.addEventListener('animationend', () => el.classList.remove('pour'), { once: true });
    return el;
  }

  function paint() {
    const n = order.length;
    order.forEach((item, i) => {
      let el = ingots.get(item.key);
      if (!el) {
        el = createIngot(item.key);
        ingots.set(item.key, el);
        rail.append(el);
      }
      const t = n === 1 ? 1 : i / (n - 1);
      const [r, g, b] = heat(t);
      el.style.setProperty('--i', i);
      el.style.setProperty('--heat', `rgb(${r} ${g} ${b})`);
      el.style.setProperty('--glow', `rgb(${r} ${g} ${b} / ${(0.15 + 0.5 * t).toFixed(2)})`);
      el.querySelector('.k').textContent = item.key;
      el.querySelector('.k').title = item.key;
      el.querySelector('.v').textContent = show(item.value);
      el.querySelector('.chip').hidden = !(n === CAPACITY && i === 0);
      el.querySelector('[data-act="read"]').setAttribute('aria-label', `Read ${item.key}`);
      el.querySelector('[data-act="delete"]').setAttribute('aria-label', `Delete ${item.key}`);
    });

    countEl.textContent = `${n} of ${CAPACITY} slots in use`;
    if (n === 0) {
      hintEl.textContent =
        'Nothing here yet. Store a key to fill the first slot. Keys stored before you opened this page appear once you read them.';
    } else if (n === CAPACITY) {
      hintEl.textContent = `The cache is full. Storing a new key evicts ${order[0].key}.`;
    } else {
      const free = CAPACITY - n;
      hintEl.textContent = `${free} ${free === 1 ? 'slot is' : 'slots are'} free. Nothing is evicted until the cache is full.`;
    }
  }

  function leave(key, mode) {
    const el = ingots.get(key);
    if (!el) return;
    ingots.delete(key);
    el.classList.remove('pour', 'reheat');
    el.classList.add(mode);
    el.setAttribute('aria-hidden', 'true');
    el.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    setTimeout(() => el.remove(), reduceMotion.matches ? 0 : 650);
  }

  function reheat(key) {
    const el = ingots.get(key);
    if (!el) return;
    el.classList.remove('reheat');
    void el.offsetWidth;
    el.classList.add('reheat');
  }

  // Same rule as src/storage.py: touching a key makes it the most recent,
  // and a new key in a full cache pushes out the coldest one.
  function touch(key, value) {
    const idx = order.findIndex((x) => x.key === key);
    const existed = idx >= 0;
    if (existed) {
      order.splice(idx, 1);
    } else if (order.length >= CAPACITY) {
      const evicted = order.shift();
      leave(evicted.key, 'evict');
    }
    order.push({ key, value });
    paint();
    if (existed) reheat(key);
  }

  function forget(key, mode = 'drop') {
    const idx = order.findIndex((x) => x.key === key);
    if (idx < 0) return;
    order.splice(idx, 1);
    leave(key, mode);
    paint();
  }

  /* ---------- request log ---------- */

  function statusClass(status) {
    if (status >= 200 && status < 300) return 'ok';
    if (status >= 400 && status < 500) return 'warn';
    return 'bad';
  }

  function addLog(method, path, status, message) {
    logs.unshift({ time: new Date(), method, path, status, message });
    if (logs.length > MAX_LOG) logs.length = MAX_LOG;
    renderLog();
  }

  function renderLog() {
    logEl.replaceChildren(...logs.map((entry) => {
      const li = document.createElement('li');
      const parts = [
        ['t', entry.time.toLocaleTimeString([], { hour12: false })],
        ['verb', entry.method],
        ['path', entry.path],
      ];
      parts.forEach(([cls, text]) => {
        const s = document.createElement('span');
        s.className = cls;
        s.textContent = text;
        li.append(s);
      });
      const st = document.createElement('span');
      st.className = `status ${statusClass(entry.status)}`;
      st.textContent = entry.status === 0 ? 'No reply' : String(entry.status);
      li.append(st);
      const m = document.createElement('span');
      m.className = 'm';
      m.textContent = entry.message;
      li.append(m);
      return li;
    }));
    logEmpty.hidden = logs.length > 0;
  }

  /* ---------- API ---------- */

  async function api(method, path, body) {
    let res;
    try {
      res = await fetch(path, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      setHealth(false);
      return { status: 0, data: null, offline: true };
    }
    let data = null;
    try { data = await res.json(); } catch { /* non-JSON error page */ }
    return { status: res.status, data };
  }

  function explain(res) {
    if (res.offline) return 'Could not reach the server. Start Flask with python main.py and the frontend with node frontend/serve.js, then open http://localhost:3000.';
    if (res.data && (res.data.message || res.data.error)) return (res.data.message || res.data.error).trim();
    if (res.status >= 500) return 'The server hit an error. Check the terminal running Flask for the traceback.';
    return `Unexpected reply (${res.status}).`;
  }

  function checkKey(key) {
    if (!key) return 'Enter a key.';
    if (key.includes('/') || key === '.' || key === '..') {
      return "Keys can't contain a slash or be . or .., because the read and delete URLs wouldn't match them.";
    }
    return '';
  }

  // One key, one value: the value is always sent as the plain text typed in.
  async function storeKey(key, value, ttlText = '') {
    const keyError = checkKey(key);
    if (keyError) return { ok: false, text: keyError };
    if (!value.trim()) return { ok: false, text: 'Enter a value.' };

    let ttl = null;
    if (ttlText) {
      if (!/^\d+$/.test(ttlText)) {
        return { ok: false, text: 'TTL must be a whole number of seconds, or empty for no expiry.' };
      }
      ttl = Number(ttlText);
    }

    const res = await api('POST', '/cache/', { key, value, ttl });
    addLog('POST', '/cache/', res.status, res.status === 201 ? `Stored ${key}` : explain(res));
    if (res.status === 201) {
      touch(key, value);
      return { ok: true, text: `Stored ${key}.` };
    }
    return { ok: false, text: explain(res) };
  }

  async function readKey(key) {
    const keyError = checkKey(key);
    if (keyError) return { ok: false, text: keyError };

    const path = `/cache/${encodeURIComponent(key)}`;
    const res = await api('GET', path);
    if (res.status === 200) {
      const value = res.data.value;
      addLog('GET', path, 200, `${key} = ${show(value)}`);
      touch(key, value);
      return { ok: true, text: `${key} = ${show(value)}` };
    }
    if (res.status === 404) forget(key, 'drop');
    addLog('GET', path, res.status, explain(res));
    return { ok: false, text: explain(res) };
  }

  async function deleteKey(key) {
    const keyError = checkKey(key);
    if (keyError) return { ok: false, text: keyError };

    const path = `/cache/${encodeURIComponent(key)}`;
    const res = await api('DELETE', path);
    addLog('DELETE', path, res.status, res.status === 200 ? `Deleted ${key}` : explain(res));
    if (res.status === 200) {
      forget(key, 'drop');
      return { ok: true, text: `Deleted ${key}.` };
    }
    if (res.status === 404) forget(key, 'drop');
    return { ok: false, text: explain(res) };
  }

  /* ---------- health ---------- */

  function setHealth(up) {
    const el = $('#health');
    el.dataset.state = up ? 'up' : 'down';
    $('#health-text').textContent = up
      ? 'Server healthy'
      : location.protocol === 'file:'
        ? 'Open this page from http://localhost:3000'
        : 'Server unreachable';
  }

  async function checkHealth() {
    try {
      const res = await fetch('/cache/health');
      const data = await res.json();
      setHealth(res.ok && data.status === 'healthy');
    } catch {
      setHealth(false);
    }
  }

  /* ---------- wiring ---------- */

  function bind(formId, handler) {
    const form = $(formId);
    const msg = form.querySelector('.msg');
    const button = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      button.disabled = true;
      msg.className = 'msg';
      msg.textContent = '';
      const result = await handler(form);
      msg.className = `msg ${result.ok ? 'ok' : 'err'}`;
      msg.textContent = result.text;
      button.disabled = false;
      if (result.ok && formId !== '#store-form') form.reset();
    });
    return form;
  }

  const storeForm = bind('#store-form', (f) =>
    storeKey(f.elements.key.value.trim(), f.elements.value.value, f.elements.ttl.value.trim()));
  bind('#read-form', (f) => readKey(f.elements.key.value.trim()));
  bind('#delete-form', (f) => deleteKey(f.elements.key.value.trim()));

  rail.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const key = btn.closest('.ingot').dataset.key;
    if (btn.dataset.act === 'read') await readKey(key);
    else await deleteKey(key);
  });

  $('#clear-log').addEventListener('click', () => {
    logs.length = 0;
    renderLog();
  });

  $('#sample').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const samples = [
      ['session:ana', 'pro'],
      ['session:ben', 'free'],
      ['session:cleo', 'pro'],
      ['session:dev', 'team'],
      ['session:eli', 'free'],
      ['session:fay', 'pro'],
    ];
    const count = Math.min(CAPACITY + 1, samples.length);
    for (const [key, value] of samples.slice(0, count)) {
      await storeKey(key, value);
      await new Promise((r) => setTimeout(r, reduceMotion.matches ? 100 : 900));
    }
    btn.disabled = false;
  });

  /* ---------- slots ---------- */

  const slotsForm = $('#slots-form');
  const slotsInput = $('#slots-input');
  const slotsApply = $('#slots-apply');
  const slotsNote = $('#slots-note');
  const slotsMsg = $('#slots-msg');
  let slotInfo = { slots: CAPACITY, defaultSlots: CAPACITY, source: 'config', max: 20, managed: true };
  let armed = false;
  let armTimer = 0;

  function disarm() {
    armed = false;
    clearTimeout(armTimer);
    slotsApply.textContent = 'Set slots';
  }

  function applySlotInfo(info) {
    slotInfo = info;
    CAPACITY = info.slots || CAPACITY;
    slotsInput.placeholder = String(info.defaultSlots ?? CAPACITY);
    const using = info.source === 'custom'
      ? `Using ${CAPACITY} slots, the number you set here.`
      : info.source === 'env'
        ? `Using ${CAPACITY} slots, from the CACHE_CAPACITY setting.`
        : `Using ${CAPACITY} slots, the default from config.py.`;
    slotsNote.textContent = info.managed
      ? `${using} Leave the box empty to use the config.py default. Changing it restarts the cache and clears every key.`
      : `${using} Flask was started outside this page, so the number can't be changed here. Stop it and run ./start.sh.`;
    slotsInput.disabled = !info.managed;
    slotsApply.disabled = !info.managed;
    buildRail();
    paint();
  }

  async function loadSlots() {
    try {
      const res = await fetch('/ui/slots');
      if (!res.ok) throw new Error();
      applySlotInfo(await res.json());
    } catch {
      slotsNote.textContent = `Could not read the slot count from the server. Showing ${CAPACITY} slots.`;
    }
  }

  slotsInput.addEventListener('input', disarm);

  slotsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    slotsMsg.className = 'msg';
    slotsMsg.textContent = '';
    const raw = slotsInput.value.trim();

    let slots = null;
    if (raw !== '') {
      if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > slotInfo.max) {
        slotsMsg.className = 'msg err';
        slotsMsg.textContent = `Enter a whole number from 1 to ${slotInfo.max}, or leave the box empty for the default.`;
        return;
      }
      slots = Number(raw);
    }

    if (!armed) {
      armed = true;
      slotsApply.textContent = 'Clear keys and apply';
      armTimer = setTimeout(disarm, 6000);
      return;
    }

    disarm();
    slotsApply.disabled = true;
    let status = 0;
    let data = null;
    try {
      const res = await fetch('/ui/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots }),
      });
      status = res.status;
      data = await res.json();
    } catch { /* offline */ }

    slotsApply.disabled = !(slotInfo.managed);
    if (status === 200) {
      applySlotInfo(data);
      slotsInput.value = '';
      slotsMsg.className = 'msg ok';
      slotsMsg.textContent = data.message;
      addLog('POST', '/ui/slots', 200, data.message);
      checkHealth();
    } else {
      const text = (data && data.error) || 'Could not reach the server.';
      slotsMsg.className = 'msg err';
      slotsMsg.textContent = text;
      addLog('POST', '/ui/slots', status, text);
    }
  });

  buildRail();
  paint();
  loadSlots();
  renderLog();
  checkHealth();
  setInterval(checkHealth, 15000);
  void storeForm;
})();
