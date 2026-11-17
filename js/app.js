import { findArbs, findCoverBets, calcStakes, formatOdds, legLabel, MARKET_LABELS } from './arb.js';
import { BOOKS, BOOK_GROUPS, BOOK_BY_KEY, DEFAULT_SPORTS } from './books.js';
import { PROP_SPORTS, PROP_SPORT_BY_KEY, propLabel } from './props.js';
import { demoEvents, demoPropEvents } from './demo-data.js';

const API = 'https://api.the-odds-api.com/v4';
const FREE_CREDITS = 500;
const PROP_WINDOW_HOURS = 48; // only scan props for games starting within this window
const POPULAR_SPORTS = new Set([...DEFAULT_SPORTS, 'soccer_epl', 'soccer_usa_mls']);

// ---------- storage (every access guarded: private windows can throw) ----------
const store = {
  get(k, fallback) {
    try {
      const v = localStorage.getItem('arbfinder:' + k);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(k, v) { try { localStorage.setItem('arbfinder:' + k, JSON.stringify(v)); } catch { /* full or blocked */ } },
  del(k) { try { localStorage.removeItem('arbfinder:' + k); } catch { /* ignore */ } },
};

const DEFAULT_SETTINGS = { minProfit: 0, bankroll: 100, roundTo: 1, maxAge: 60, format: 'american', excludeLive: true };

const state = {
  apiKey: store.get('key', ''),
  mode: store.get('mode', 'lines'), // 'lines' | 'props'
  sports: store.get('sportsList', []), // [{key, group, title, active, has_outrights}]
  selectedSports: new Set(store.get('selectedSports', DEFAULT_SPORTS)),
  markets: new Set(store.get('markets', ['h2h', 'spreads', 'totals'])),
  books: new Set(store.get('books', BOOKS.filter((b) => b.default).map((b) => b.key))),
  propSport: store.get('propSport', 'basketball_nba'),
  propMarkets: store.get('propMarkets', {}), // { sportKey: [marketKeys] }
  propGames: store.get('propGames', 5),
  propEvents: null, // { sport, events, at } - upcoming games list (free call)
  settings: { ...DEFAULT_SETTINGS, ...store.get('settings', {}) },
  data: store.get('data', null), // game lines: { fetchedAt, events, demo, errors }
  propsData: store.get('propsData', null), // player props: same shape + sport
  quota: store.get('quota', null), // { remaining, used, last, at }
  busy: false,
  keyError: false,
  coverOpen: false,
};

// ---------- tiny DOM helper (textContent only; API strings never go through innerHTML) ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const $ = (id) => document.getElementById(id);

const money = (n) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const safeUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : null; } catch { return null; } };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const isoNoMs = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

function ago(ms) {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const hrs = Math.floor(m / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function when(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const bookGroups = () => Math.max(1, Math.ceil(state.books.size / 10));
const activeSportKeys = () => new Set(state.sports.filter((s) => s.active && !s.has_outrights).map((s) => s.key));

// ---------- mode switch ----------
function renderMode() {
  for (const btn of document.querySelectorAll('[data-mode]')) {
    const on = btn.dataset.mode === state.mode;
    btn.setAttribute('aria-selected', String(on));
    btn.classList.toggle('active', on);
  }
  for (const el of document.querySelectorAll('[data-show]')) el.hidden = el.dataset.show !== state.mode;
  $('fetch').textContent = state.mode === 'props' ? 'Find prop arbs' : 'Find arbs';
}

function setMode(mode) {
  state.mode = mode;
  store.set('mode', mode);
  renderMode();
  if (mode === 'props') { renderPropSports(); renderPropMarkets(); loadPropEvents(); }
  renderCost();
  renderResults();
}

// ---------- settings panel: game lines ----------
function renderKey() {
  $('api-key').value = state.apiKey ? '••••••••' + state.apiKey.slice(-4) : '';
  $('clear-key').hidden = !state.apiKey;
}

function renderSports() {
  const box = $('sports');
  box.replaceChildren();
  const list = state.sports.filter((s) => s.active && !s.has_outrights);
  if (!state.apiKey) {
    box.append(h('p', { class: 'hint' }, 'Save a key to load the sports currently in season.'));
    return;
  }
  if (!list.length) {
    box.append(h('p', { class: 'hint' }, state.keyError ? 'Fix the key above to load sports.' : 'Loading sports…'));
    return;
  }
  const groups = new Map();
  for (const s of list) {
    if (!groups.has(s.group)) groups.set(s.group, []);
    groups.get(s.group).push(s);
  }
  const order = ['American Football', 'Basketball', 'Ice Hockey', 'Baseball', 'Soccer', 'Mixed Martial Arts', 'Boxing', 'Tennis', 'Golf'];
  const sorted = [...groups.keys()].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });

  for (const g of sorted) {
    const items = groups.get(g);
    const nSel = items.filter((s) => state.selectedSports.has(s.key)).length;
    box.append(h('details', { class: 'sport-group', open: nSel > 0 },
      h('summary', {}, g, nSel ? h('span', { class: 'count' }, String(nSel)) : null),
      h('div', { class: 'chips' }, items.map((s) =>
        h('label', { class: 'chip', title: s.description || '' },
          h('input', {
            type: 'checkbox', checked: state.selectedSports.has(s.key),
            onchange: (e) => {
              e.target.checked ? state.selectedSports.add(s.key) : state.selectedSports.delete(s.key);
              store.set('selectedSports', [...state.selectedSports]);
              renderSports();
              renderCost();
            },
          }),
          ' ', s.title)))));
  }
}

function renderMarkets() {
  for (const input of $('markets').querySelectorAll('input')) {
    input.checked = state.markets.has(input.value);
    input.onchange = () => {
      input.checked ? state.markets.add(input.value) : state.markets.delete(input.value);
      store.set('markets', [...state.markets]);
      renderCost();
      renderResults();
    };
  }
}

// ---------- settings panel: player props ----------
function propSportList() {
  // Without a key (or before sports load) show every prop sport so people can explore.
  const active = activeSportKeys();
  const inSeason = PROP_SPORTS.filter((s) => active.has(s.key));
  return inSeason.length ? inSeason : PROP_SPORTS;
}

function selectedPropMarkets(sportKey = state.propSport) {
  const saved = state.propMarkets[sportKey];
  if (saved) return new Set(saved);
  return new Set((PROP_SPORT_BY_KEY[sportKey]?.markets || []).filter((m) => m.default).map((m) => m.key));
}

function renderPropSports() {
  const box = $('prop-sports');
  box.replaceChildren();
  const list = propSportList();
  if (!list.some((s) => s.key === state.propSport)) state.propSport = list[0].key;
  box.append(h('div', { class: 'chips' }, list.map((s) =>
    h('label', { class: 'chip' },
      h('input', {
        type: 'radio', name: 'prop-sport', checked: s.key === state.propSport,
        onchange: () => {
          state.propSport = s.key;
          store.set('propSport', s.key);
          renderPropMarkets();
          loadPropEvents();
          renderCost();
          renderResults();
        },
      }),
      ' ', s.title))));
}

function renderPropMarkets() {
  const box = $('prop-markets');
  box.replaceChildren();
  const sport = PROP_SPORT_BY_KEY[state.propSport];
  if (!sport) return;
  const sel = selectedPropMarkets();
  const save = (set) => {
    state.propMarkets[state.propSport] = [...set];
    store.set('propMarkets', state.propMarkets);
    renderPropMarkets();
    renderCost();
  };
  box.append(
    h('div', { class: 'chips' }, sport.markets.map((m) =>
      h('label', { class: 'chip' },
        h('input', {
          type: 'checkbox', checked: sel.has(m.key),
          onchange: (e) => { e.target.checked ? sel.add(m.key) : sel.delete(m.key); save(sel); },
        }),
        ' ', m.label))),
    h('div', { class: 'group-actions' },
      h('button', { type: 'button', class: 'link-btn', onclick: () => save(new Set(sport.markets.filter((m) => m.default).map((m) => m.key))) }, 'defaults'),
      h('button', { type: 'button', class: 'link-btn', onclick: () => save(new Set()) }, 'none')));
}

/** Upcoming games for the prop sport. The events endpoint is free (no credits). */
async function loadPropEvents() {
  if (!state.apiKey || state.keyError) return;
  const sport = state.propSport;
  if (state.propEvents?.sport === sport && Date.now() - state.propEvents.at < 5 * 60_000) return;
  try {
    const now = Date.now();
    const params = new URLSearchParams({
      apiKey: state.apiKey,
      commenceTimeFrom: isoNoMs(now),
      commenceTimeTo: isoNoMs(now + PROP_WINDOW_HOURS * 3_600_000),
    });
    const res = await fetch(`${API}/sports/${encodeURIComponent(sport)}/events?${params}`);
    readQuota(res);
    if (!res.ok) return;
    const events = (await res.json()).sort((a, b) => Date.parse(a.commence_time) - Date.parse(b.commence_time));
    if (state.propSport === sport) {
      state.propEvents = { sport, events, at: Date.now() };
      renderCost();
    }
  } catch { /* estimate just stays approximate */ }
}

function propGamesToScan() {
  const pe = state.propEvents;
  if (pe && pe.sport === state.propSport) return Math.min(state.propGames, pe.events.length);
  return state.propGames;
}

// ---------- settings panel: books ----------
function renderBooks() {
  const box = $('books');
  box.replaceChildren();
  for (const g of BOOK_GROUPS) {
    const items = BOOKS.filter((b) => b.group === g.id);
    const nSel = items.filter((b) => state.books.has(b.key)).length;
    const toggleAll = (on) => {
      for (const b of items) on ? state.books.add(b.key) : state.books.delete(b.key);
      saveBooks();
    };
    box.append(h('details', { class: 'book-group', open: g.id === 'us' || nSel > 0 },
      h('summary', {}, g.label, nSel ? h('span', { class: 'count' }, String(nSel)) : null),
      g.note ? h('p', { class: 'hint small' }, g.note) : null,
      h('div', { class: 'chips' }, items.map((b) =>
        h('label', { class: 'chip' + (b.paid ? ' paid' : '') },
          h('input', {
            type: 'checkbox', checked: state.books.has(b.key),
            onchange: (e) => { e.target.checked ? state.books.add(b.key) : state.books.delete(b.key); saveBooks(); },
          }),
          ' ', b.title,
          b.paid ? h('span', { class: 'tag', title: 'Only returns odds on a paid Odds API plan' }, 'paid plan') : null))),
      h('div', { class: 'group-actions' },
        h('button', { type: 'button', class: 'link-btn', onclick: () => toggleAll(true) }, 'all'),
        h('button', { type: 'button', class: 'link-btn', onclick: () => toggleAll(false) }, 'none'))));
  }
}

function saveBooks() {
  store.set('books', [...state.books]);
  renderBooks();
  renderCost();
  renderResults();
}

// ---------- cost ----------
function sportsToFetch() {
  const active = activeSportKeys();
  return [...state.selectedSports].filter((k) => active.has(k));
}

function renderCost() {
  const el = $('cost');
  el.replaceChildren();
  const propNote = $('props-cost');
  propNote.replaceChildren();
  if (!state.apiKey) { $('fetch').disabled = true; return; }

  const problems = [];
  let total = 0;
  if (state.mode === 'props') {
    const nMarkets = selectedPropMarkets().size;
    const games = propGamesToScan();
    total = games * nMarkets * bookGroups();
    if (!nMarkets) problems.push('pick at least one prop');
    const pe = state.propEvents;
    if (pe && pe.sport === state.propSport && pe.events.length === 0) problems.push(`no ${PROP_SPORT_BY_KEY[state.propSport]?.title || ''} games in the next ${PROP_WINDOW_HOURS}h`);

    // explain the cost in plain numbers
    if (nMarkets) {
      const scans = total ? Math.floor(FREE_CREDITS / total) : 0;
      propNote.append(
        h('strong', {}, 'Props cost more. '),
        `Props are charged per game: ${plural(games, 'game')} × ${plural(nMarkets, 'prop')}`,
        bookGroups() > 1 ? ` × ${bookGroups()} (more than 10 books)` : '',
        ` = up to ${plural(total, 'credit')} per scan. `,
        `The free plan's ${FREE_CREDITS} credits a month covers about ${scans} scan${scans === 1 ? '' : 's'} like this. `,
        'For regular prop scanning, a ',
        h('a', { href: 'https://the-odds-api.com/#get-access', target: '_blank', rel: 'noopener' }, 'paid Odds API plan'),
        ' (from $30/month for 20,000 credits) is the better fit. ',
        h('a', { href: 'guide.html#props' }, 'More on props'));
    }
  } else {
    const nSports = sportsToFetch().length;
    total = nSports * state.markets.size * bookGroups();
    if (!nSports) problems.push('pick at least one sport');
    if (!state.markets.size) problems.push('pick a market');
  }
  if (state.books.size < 2) problems.push('pick at least two books');

  if (problems.length) {
    el.append(h('span', { class: 'warn' }, 'To search: ' + problems.join(', ') + '.'));
  } else {
    el.append(state.mode === 'props' ? 'This scan uses up to ' : 'This search uses about ', h('strong', {}, plural(total, 'credit')), '.');
    if (state.quota && state.quota.remaining != null && total > state.quota.remaining) {
      el.append(h('br'), h('span', { class: 'warn' }, `You have ${state.quota.remaining} left.`));
    }
  }
  $('fetch').disabled = state.busy || problems.length > 0;
}

function renderQuota() {
  const el = $('quota');
  const q = state.quota;
  if (!q || q.remaining == null || !state.apiKey) { el.hidden = true; return; }
  el.hidden = false;
  el.replaceChildren(h('span', { class: 'quota-num' }, String(q.remaining)), ' credits left');
  el.title = `Used this period: ${q.used ?? '?'} · Last request cost: ${q.last ?? '?'}`;
}

function setStatus(msg, kind = '') {
  const el = $('status');
  el.textContent = msg || '';
  el.className = 'status' + (kind ? ' ' + kind : '');
}

function setKeyStatus(msg, kind = '') {
  const el = $('key-status');
  el.textContent = msg || '';
  el.className = 'key-status' + (kind ? ' ' + kind : '');
  el.hidden = !msg;
}

// ---------- filters ----------
function bindFilters() {
  const s = state.settings;
  const bind = (id, key, parse, prop = 'value') => {
    const el = $(id);
    el[prop] = s[key];
    el.addEventListener(prop === 'checked' ? 'change' : 'input', () => {
      const v = parse(el[prop]);
      if (v === null) return;
      s[key] = v;
      store.set('settings', s);
      renderResults();
    });
  };
  const num = (v) => (v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  bind('f-minprofit', 'minProfit', num);
  bind('f-bankroll', 'bankroll', (v) => (num(v) > 0 ? num(v) : null));
  bind('f-round', 'roundTo', num);
  bind('f-maxage', 'maxAge', num);
  bind('f-format', 'format', (v) => v);
  bind('f-live', 'excludeLive', Boolean, 'checked');

  const games = $('prop-games');
  games.value = String(state.propGames);
  games.addEventListener('change', () => {
    state.propGames = Number(games.value);
    store.set('propGames', state.propGames);
    renderCost();
  });
}

// ---------- API ----------
function readQuota(res) {
  const n = (x) => (x == null || x === '' ? null : Number(x));
  const remaining = n(res.headers.get('x-requests-remaining'));
  if (remaining == null) return;
  state.quota = {
    remaining,
    used: n(res.headers.get('x-requests-used')),
    last: n(res.headers.get('x-requests-last')),
    at: Date.now(),
  };
  store.set('quota', state.quota);
  renderQuota();
}

async function apiError(res) {
  let msg = '';
  try { msg = (await res.json()).message || ''; } catch { /* not json */ }
  if (res.status === 401) return 'The Odds API rejected this key. Check it was pasted correctly, or that it has credits left this month.';
  if (res.status === 429) return 'Too many requests. Wait a few seconds and try again.';
  return `${res.status}: ${msg || res.statusText}`;
}

/** Loads in-season sports. Free (no credits), so it doubles as the key check. */
async function loadSports({ announce = false } = {}) {
  if (!state.apiKey) return;
  try {
    const res = await fetch(`${API}/sports?apiKey=${encodeURIComponent(state.apiKey)}`);
    readQuota(res);
    if (!res.ok) {
      setKeyStatus(await apiError(res), 'error');
      state.keyError = true;
      state.sports = [];
      renderSports();
      return;
    }
    state.sports = await res.json();
    state.keyError = false;
    store.set('sportsList', state.sports);
    if (announce) {
      const n = state.sports.filter((s) => s.active && !s.has_outrights).length;
      setKeyStatus(`✓ Key works. ${n} sports in season. Now pick sports and books below.`, 'ok');
    }
  } catch {
    setKeyStatus('Could not reach The Odds API. Check your connection and try again.', 'error');
  }
  renderSports();
  renderPropSports();
  if (state.mode === 'props') { renderPropMarkets(); loadPropEvents(); }
  renderCost();
  renderResults();
}

function oddsParams(markets) {
  return new URLSearchParams({
    apiKey: state.apiKey,
    bookmakers: [...state.books].join(','),
    markets: markets.join(','),
    oddsFormat: 'decimal',
    dateFormat: 'iso',
    includeLinks: 'true',
  });
}

async function fetchLines() {
  const sports = sportsToFetch();
  const titles = Object.fromEntries(state.sports.map((s) => [s.key, s.title]));
  const events = [];
  const errors = [];
  let fatal = null;

  for (const [i, sport] of sports.entries()) {
    setStatus(`Fetching ${titles[sport] || sport} (${i + 1} of ${sports.length})…`);
    try {
      const res = await fetch(`${API}/sports/${encodeURIComponent(sport)}/odds?${oddsParams([...state.markets])}`);
      readQuota(res);
      if (!res.ok) {
        const msg = await apiError(res);
        if (res.status === 401 || res.status === 429) { fatal = msg; break; }
        errors.push(`${titles[sport] || sport}: ${msg}`);
        continue;
      }
      const json = await res.json();
      if (Array.isArray(json)) events.push(...json);
    } catch {
      fatal = 'Could not reach The Odds API. Check your connection.';
      break;
    }
  }

  if (events.length || !fatal) {
    state.data = { fetchedAt: Date.now(), events, demo: false, errors };
    store.set('data', state.data);
  }
  return { fatal, errors, summary: `Checked ${plural(events.length, 'game')}.` };
}

async function fetchProps() {
  const sport = state.propSport;
  const markets = [...selectedPropMarkets()];
  state.propEvents = null; // force a fresh game list
  setStatus('Getting the game list (free)…');
  await loadPropEvents();
  const games = (state.propEvents?.events || [])
    .filter((e) => Date.parse(e.commence_time) > Date.now())
    .slice(0, state.propGames);

  const events = [];
  const errors = [];
  let fatal = null;
  if (!games.length) fatal = `No upcoming ${PROP_SPORT_BY_KEY[sport]?.title || sport} games found in the next ${PROP_WINDOW_HOURS} hours.`;

  for (const [i, g] of games.entries()) {
    setStatus(`Fetching props: ${g.away_team} @ ${g.home_team} (${i + 1} of ${games.length})…`);
    try {
      const res = await fetch(`${API}/sports/${encodeURIComponent(sport)}/events/${encodeURIComponent(g.id)}/odds?${oddsParams(markets)}`);
      readQuota(res);
      if (!res.ok) {
        const msg = await apiError(res);
        if (res.status === 401 || res.status === 429) { fatal = msg; break; }
        errors.push(`${g.away_team} @ ${g.home_team}: ${msg}`);
        continue;
      }
      const json = await res.json();
      if (json && json.id) events.push(json);
    } catch {
      fatal = 'Could not reach The Odds API. Check your connection.';
      break;
    }
  }

  if (events.length) {
    state.propsData = { fetchedAt: Date.now(), events, demo: false, errors, sport };
    store.set('propsData', state.propsData);
  }
  const withProps = events.filter((e) => (e.bookmakers || []).length).length;
  return {
    fatal,
    errors,
    summary: withProps
      ? `Checked props for ${plural(withProps, 'game')}.`
      : 'No props posted yet for these games. Books usually post them the day of the game.',
  };
}

async function runSearch() {
  if (state.busy) return;
  state.busy = true;
  renderCost();
  const { fatal, errors, summary } = state.mode === 'props' ? await fetchProps() : await fetchLines();
  state.busy = false;
  if (fatal) setStatus(fatal, 'error');
  else if (errors.length) setStatus(`Done, with problems: ${errors.join(' · ')}`, 'warn');
  else setStatus(summary);
  renderCost();
  renderResults();
}

function loadDemo() {
  const now = Date.now();
  state.data = { fetchedAt: now, events: demoEvents(now), demo: true, errors: [] };
  state.propsData = { fetchedAt: now, events: demoPropEvents(now), demo: true, errors: [], sport: 'basketball_nba' };
  setStatus('Loaded sample data for game lines and player props. Nothing was fetched and no credits were used.');
  renderResults();
}

// ---------- results ----------
function renderResults() {
  const list = $('list');
  const summary = $('summary');
  const cover = $('cover');
  list.replaceChildren();
  summary.replaceChildren();
  cover.replaceChildren();

  const props = state.mode === 'props';
  const data = props ? state.propsData : state.data;

  if (!data) {
    if (!state.apiKey) {
      list.append(h('div', { class: 'panel onboarding' },
        h('h3', {}, 'Get set up in 3 minutes'),
        h('p', { class: 'muted' }, 'Arb Finder is free. It uses your own free key from The Odds API to pull live odds from DraftKings, FanDuel, BetMGM and more.'),
        h('ol', { class: 'steps compact' },
          h('li', {}, h('a', { href: 'https://the-odds-api.com/#get-access', target: '_blank', rel: 'noopener' }, 'Sign up at the-odds-api.com'),
            ' and choose the free ', h('strong', {}, 'Starter'), ' plan.'),
          h('li', {}, 'Copy the API key they email you. Check spam if it isn’t there.'),
          h('li', {}, 'Paste it into box ', h('strong', {}, '1'), ' and press ', h('strong', {}, 'Save'), '.'),
          h('li', {}, 'Tick only the sportsbooks you have accounts at, then press ', h('strong', {}, 'Find arbs'), '.')),
        h('div', { class: 'onboarding-actions' },
          h('a', { class: 'btn btn-primary', href: 'guide.html' }, 'Read the full guide'),
          h('button', { class: 'btn', type: 'button', onclick: loadDemo }, 'Try sample data first'))));
      return;
    }
    list.append(h('div', { class: 'panel empty' },
      h('h3', {}, 'Ready when you are'),
      h('p', {}, props
        ? ['Pick a sport, props and books on the left, then press ', h('strong', {}, 'Find prop arbs'), '.']
        : ['Pick sports and books on the left, then press ', h('strong', {}, 'Find arbs'), '.']),
      h('button', { class: 'btn', type: 'button', onclick: loadDemo }, 'Show sample data')));
    return;
  }

  const s = state.settings;
  const allow = new Set(state.books);
  let arbs = findArbs(data.events, {
    allowBooks: allow,
    maxAgeMinutes: s.maxAge,
    excludeLive: s.excludeLive,
    minProfitPct: s.minProfit,
  });
  arbs = props ? arbs.filter((a) => a.isProp) : arbs.filter((a) => state.markets.has(a.market));

  const ageMin = (Date.now() - data.fetchedAt) / 60000;
  const what = props ? `props in ${plural(data.events.length, 'game')}` : `${plural(data.events.length, 'game')}`;
  summary.append(
    h('div', {},
      h('strong', {}, `${arbs.length} ${arbs.length === 1 ? 'opportunity' : 'opportunities'}`),
      ` across ${what}`,
      data.demo ? h('span', { class: 'tag demo' }, 'sample data') : null),
    h('div', { class: ageMin > 15 && !data.demo ? 'warn' : 'muted' },
      data.demo ? 'Made-up odds for illustration' : `Odds fetched ${ago(data.fetchedAt)}${ageMin > 15 ? ', prices have probably moved' : ''}`));

  if (props && arbs.length) {
    list.append(h('p', { class: 'note warn tip' },
      'Prop arbs get accounts limited faster than anything else. Use them sparingly at books you want to keep. ',
      h('a', { href: 'guide.html#stay-unlimited' }, 'How to last longer')));
  }

  if (!arbs.length) {
    list.append(h('div', { class: 'panel empty' },
      h('h3', {}, 'Nothing right now'),
      h('p', {}, props
        ? 'Prop arbs come and go fast, and many props only go up on game day. Try more props, more books, a game closer to tip-off, or set Min profit to -1% to see the closest lines.'
        : 'Real arbs are rare and short-lived. Things that help: add more books, add more sports, or set Min profit to a negative number (like -1%) to see the closest lines.')));
  } else {
    for (const arb of arbs) list.append(renderArb(arb));
  }

  if (!props) renderCoverBets(cover, data);
}

function renderArb(arb) {
  const s = state.settings;
  const prices = arb.legs.map((l) => l.price);
  const calc = calcStakes(prices, s.bankroll, s.roundTo);
  const isArb = arb.profitPct > 0;
  const suspicious = arb.profitPct > 10;
  const ev = arb.event;
  const hasExchange = arb.legs.some((l) => l.books.some((b) => BOOK_BY_KEY[b.bookKey]?.group === 'exchange'));
  const matchup = ev.away && ev.home ? `${ev.away} @ ${ev.home}` : ev.home || ev.away || 'Event';
  const title = arb.isProp ? arb.player : matchup;
  const marketTag = arb.isProp ? propLabel(arb.market, ev.sportKey) : MARKET_LABELS[arb.market];

  const rows = arb.legs.map((leg, i) => {
    const bookEls = leg.books.map((b, j) => {
      const url = b.link && safeUrl(b.link);
      const name = url ? h('a', { href: url, target: '_blank', rel: 'noopener nofollow' }, b.bookTitle) : b.bookTitle;
      return [j ? ', ' : '', name];
    });
    const newest = Math.max(...leg.books.map((b) => b.updated || 0));
    return h('tr', {},
      h('td', { 'data-label': 'Bet' }, h('span', { class: 'leg-name' }, legLabel(arb.market, leg))),
      h('td', { 'data-label': 'Book' }, bookEls, newest ? h('div', { class: 'muted small' }, `updated ${ago(newest)}`) : null),
      h('td', { 'data-label': 'Odds', class: 'num' }, formatOdds(leg.price, s.format)),
      h('td', { 'data-label': 'Stake', class: 'num strong' }, money(calc.stakes[i])),
      h('td', { 'data-label': 'Returns', class: 'num' }, money(calc.payouts[i])));
  });

  return h('article', { class: 'panel arb' + (isArb ? '' : ' near') },
    h('div', { class: 'arb-head' },
      h('div', { class: 'profit' + (isArb ? '' : ' neg') },
        `${arb.profitPct >= 0 ? '+' : ''}${arb.profitPct.toFixed(2)}%`),
      h('div', { class: 'arb-title' },
        h('div', { class: 'matchup' }, title),
        h('div', { class: 'meta' },
          h('span', { class: 'tag' }, ev.sportTitle),
          h('span', { class: 'tag market' }, marketTag),
          ev.live ? h('span', { class: 'tag live' }, 'LIVE') : null,
          arb.isProp ? h('span', { class: 'muted' }, matchup + ' ·') : null,
          h('span', { class: 'muted' }, when(ev.commence))))),
    h('table', { class: 'legs' },
      h('thead', {}, h('tr', {}, ['Bet', 'Book', 'Odds', 'Stake', 'Returns'].map((t, i) => h('th', { class: i >= 2 ? 'num' : '' }, t)))),
      h('tbody', {}, rows)),
    h('div', { class: 'arb-foot' },
      h('span', {}, 'Total staked ', h('strong', {}, money(calc.staked))),
      h('span', { class: calc.minProfit >= 0 ? 'good' : 'bad' },
        calc.minProfit >= 0 ? 'Guaranteed profit ' : 'Worst-case loss ',
        h('strong', {}, money(Math.abs(calc.minProfit))),
        Math.abs(calc.maxProfit - calc.minProfit) >= 0.01 ? h('span', { class: 'muted' }, ` (up to ${money(calc.maxProfit)})`) : null)),
    arb.isProp ? h('p', { class: 'note muted' }, 'If the player doesn’t play, books usually void the prop, but not always at every book. Check each book’s rules.') : null,
    suspicious ? h('p', { class: 'note warn' }, 'Unusually large edge. This is most likely a stale price or a pricing error the book may void. Double-check before betting.') : null,
    hasExchange ? h('p', { class: 'note muted' }, 'Includes an exchange or prediction market; their fees reduce this profit.') : null);
}

/** Cheapest normal-looking straight bets at each of the user's books, from game lines already loaded. */
function renderCoverBets(box, data) {
  const s = state.settings;
  const books = findCoverBets(data.events, {
    allowBooks: new Set([...state.books].filter((k) => BOOK_BY_KEY[k]?.group !== 'exchange')),
    maxAgeMinutes: s.maxAge,
    popularSports: POPULAR_SPORTS,
    perBook: 2,
  }).filter((b) => b.picks.length);
  if (!books.length) return;

  const stake = 10;
  const rows = books.flatMap((b) => b.picks.map((p, i) => {
    const ev = p.event;
    const cost = stake * p.margin;
    return h('tr', {},
      h('td', { 'data-label': 'Book' }, i === 0 ? h('strong', {}, b.bookTitle) : ''),
      h('td', { 'data-label': 'Bet' },
        h('span', { class: 'leg-name' }, legLabel(p.market, p.leg)),
        p.market !== 'h2h' ? '' : h('span', { class: 'muted' }, ' to win'),
        h('div', { class: 'muted small' }, `${ev.away} @ ${ev.home} · ${ev.sportTitle} · ${when(ev.commence)}`)),
      h('td', { 'data-label': 'Odds', class: 'num' }, formatOdds(p.leg.price, s.format)),
      h('td', { 'data-label': `Cost / $${stake}`, class: 'num' }, cost <= 0 ? 'free' : `≈ ${money(cost)}`));
  }));

  box.append(h('details', { class: 'panel cover-bets', open: state.coverOpen, ontoggle: (e) => { state.coverOpen = e.target.open; } },
    h('summary', {}, 'Cover bets: cheap “normal” bets to mix in at your books',
      h('span', { class: 'muted small' }, ' · uses odds already loaded, no credits')),
    h('p', { class: 'hint' },
      'Books are quicker to limit accounts that only ever bet arbs. Placing a few small, ordinary bets on popular games makes your account look like a regular customer’s. ',
      'These are the lowest-margin bets each book is offering on big games right now, on the side most casual bettors take. ',
      'Every bet still loses money on average. The last column is the expected cost of a $10 bet. ',
      h('a', { href: 'guide.html#stay-unlimited' }, 'Full strategy')),
    h('table', { class: 'legs cover-table' },
      h('thead', {}, h('tr', {}, ['Book', 'Bet', 'Odds', `Cost / $${stake}`].map((t, i) => h('th', { class: i >= 2 ? 'num' : '' }, t)))),
      h('tbody', {}, rows))));
}

// ---------- wiring ----------
function init() {
  renderKey();
  renderSports();
  renderMarkets();
  renderPropSports();
  renderPropMarkets();
  renderBooks();
  renderQuota();
  bindFilters();
  renderMode();
  renderCost();

  for (const btn of document.querySelectorAll('[data-mode]')) btn.addEventListener('click', () => setMode(btn.dataset.mode));

  $('key-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('api-key').value.replace(/\s+/g, ''); // pasted keys often carry spaces/newlines
    if (!v || v.startsWith('••')) return;
    state.apiKey = v;
    state.propEvents = null;
    store.set('key', v);
    renderKey();
    setKeyStatus('Checking key…');
    renderSports();
    loadSports({ announce: true });
  });
  $('api-key').addEventListener('focus', (e) => { if (e.target.value.startsWith('••')) e.target.value = ''; });
  $('api-key').addEventListener('blur', (e) => { if (!e.target.value) renderKey(); });
  $('clear-key').addEventListener('click', () => {
    state.apiKey = '';
    state.quota = null;
    state.propEvents = null;
    store.del('key');
    store.del('quota');
    renderKey(); renderQuota(); renderSports(); renderCost(); renderResults();
    setKeyStatus('Key removed from this browser.');
  });
  $('fetch').addEventListener('click', runSearch);
  $('demo').addEventListener('click', loadDemo);

  const params = new URLSearchParams(location.search);
  if (params.get('mode') === 'props' || params.get('mode') === 'lines') setMode(params.get('mode'));
  if (params.has('demo')) loadDemo();
  else renderResults();

  if (state.apiKey) loadSports(); // refresh in-season list (free call)

  // keep "fetched Xm ago" labels honest
  setInterval(() => { if ((state.data || state.propsData) && !state.busy) renderResults(); }, 60_000);
}

init();
