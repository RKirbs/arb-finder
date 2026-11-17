// Pure arbitrage math. No DOM access, so it can be tested on its own.
// Works on the event JSON returned by The Odds API v4 (/v4/sports/{sport}/odds and
// /v4/sports/{sport}/events/{id}/odds, oddsFormat=decimal).

import { isPropMarket } from './props.js';

export const MARKET_LABELS = { h2h: 'Moneyline', spreads: 'Spread', totals: 'Total' };

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** Normalise a line number so 2.5 and 2.50 (and -0 and 0) group together. */
function lineKey(n) {
  const v = Math.round(Number(n) * 100) / 100;
  return Object.is(v, -0) ? 0 : v;
}

/**
 * Which "line" an outcome belongs to. Outcomes on the same line are mutually exclusive
 * and together cover every result, so the best price on each can be combined.
 *   h2h     -> one line per event (2-way or 3-way with Draw)
 *   totals  -> Over x pairs with Under x
 *   spreads -> Home -x pairs with Away +x (keyed by the home team's number)
 */
function groupLine(event, market, outcome) {
  if (market === 'h2h') return '';
  if (isPropMarket(market)) {
    // Player props: same player, same number. name is the side (Over/Under), description is the player.
    if (!outcome.description) return null;
    const pt = outcome.point === undefined || outcome.point === null ? '' : lineKey(outcome.point);
    return `${outcome.description}|${pt}`;
  }
  if (outcome.point === undefined || outcome.point === null) return null;
  if (market === 'totals') return lineKey(outcome.point);
  if (market === 'spreads') {
    if (outcome.name === event.home_team) return lineKey(outcome.point);
    if (outcome.name === event.away_team) return lineKey(-outcome.point);
    return null;
  }
  return null;
}

/**
 * Find every line where backing the best available price on each outcome
 * costs less than the payout every outcome returns.
 *
 * @param {object[]} events  Odds API events
 * @param {object}   opts
 * @param {Set<string>} [opts.allowBooks]   only use these bookmaker keys (all if omitted)
 * @param {number}   [opts.maxAgeMinutes]   ignore prices last updated longer ago than this (0 = off)
 * @param {boolean}  [opts.excludeLive]     skip events that have already started
 * @param {number}   [opts.minProfitPct]    only return lines at or above this ROI (can be negative for near-arbs)
 * @param {number}   [opts.now]             current time in ms (for testing)
 */
export function findArbs(events, opts = {}) {
  const {
    allowBooks = null,
    maxAgeMinutes = 0,
    excludeLive = true,
    minProfitPct = 0,
    now = Date.now(),
  } = opts;

  const results = [];

  for (const ev of events || []) {
    const start = Date.parse(ev.commence_time);
    const live = Number.isFinite(start) && start <= now;
    if (excludeLive && live) continue;

    // groupKey -> { market, line, outcomes: Map(name -> offers[]) }
    const groups = new Map();

    for (const bm of ev.bookmakers || []) {
      if (allowBooks && !allowBooks.has(bm.key)) continue;
      for (const m of bm.markets || []) {
        if (!(m.key in MARKET_LABELS) && !isPropMarket(m.key)) continue;
        const updated = Date.parse(m.last_update || bm.last_update);
        if (maxAgeMinutes > 0 && Number.isFinite(updated) && now - updated > maxAgeMinutes * 60_000) continue;

        for (const o of m.outcomes || []) {
          const price = Number(o.price);
          if (!(price > 1)) continue;
          const line = groupLine(ev, m.key, o);
          if (line === null) continue;
          const gk = `${m.key}|${line}`;
          let g = groups.get(gk);
          if (!g) {
            g = { market: m.key, line, outcomes: new Map() };
            groups.set(gk, g);
          }
          if (!g.outcomes.has(o.name)) g.outcomes.set(o.name, []);
          g.outcomes.get(o.name).push({
            bookKey: bm.key,
            bookTitle: bm.title || bm.key,
            price,
            point: o.point,
            description: o.description,
            link: o.link || m.link || bm.link || null,
            updated: Number.isFinite(updated) ? updated : null,
          });
        }
      }
    }

    for (const [gk, g] of groups) {
      const names = [...g.outcomes.keys()];
      if (!coversEverything(g.market, names)) continue;

      const legs = names.map((name) => {
        const offers = g.outcomes.get(name);
        const best = Math.max(...offers.map((x) => x.price));
        const atBest = offers.filter((x) => x.price === best);
        return {
          name,
          point: atBest[0].point,
          description: atBest[0].description,
          price: best,
          books: atBest,
          // how many books quote this side at all (context for the user)
          bookCount: offers.length,
        };
      });

      // Keep a stable order: away, home, draw / over, under.
      legs.sort((a, b) => legOrder(ev, a.name) - legOrder(ev, b.name));

      const implied = sum(legs.map((l) => 1 / l.price));
      const profitPct = (1 / implied - 1) * 100;
      if (profitPct < minProfitPct) continue;

      results.push({
        id: `${ev.id}|${gk}`,
        event: {
          id: ev.id,
          sportKey: ev.sport_key,
          sportTitle: ev.sport_title || ev.sport_key,
          home: ev.home_team,
          away: ev.away_team,
          commence: ev.commence_time,
          live,
        },
        market: g.market,
        line: g.line,
        isProp: isPropMarket(g.market),
        player: isPropMarket(g.market) ? legs[0].description : null,
        legs,
        implied,
        profitPct,
      });
    }
  }

  results.sort((a, b) => b.profitPct - a.profitPct);
  return results;
}

/** True when the outcomes on a line are mutually exclusive and cover every result. */
function coversEverything(market, names) {
  const set = new Set(names);
  const is = (a, b) => set.size === 2 && set.has(a) && set.has(b);
  if (market === 'h2h') return set.size === 2 || set.size === 3; // 3-way when a Draw is offered
  if (market === 'spreads') return set.size === 2; // home/away guaranteed by groupLine
  if (market === 'totals') return is('Over', 'Under');
  if (isPropMarket(market)) return is('Over', 'Under') || is('Yes', 'No');
  return false;
}

function legOrder(ev, name) {
  if (name === ev.away_team || name === 'Over' || name === 'Yes') return 0;
  if (name === ev.home_team || name === 'Under' || name === 'No') return 1;
  return 2;
}

/**
 * Split a total stake across legs so every outcome pays the same.
 * roundTo > 0 rounds each stake to that increment (rounded bets look less like arbing),
 * and the reported profit is the worst case after rounding.
 */
export function calcStakes(prices, total, roundTo = 0) {
  const inv = prices.map((p) => 1 / p);
  const s = sum(inv);
  let stakes = inv.map((i) => (total * i) / s);
  if (roundTo > 0) stakes = stakes.map((x) => Math.max(roundTo, Math.round(x / roundTo) * roundTo));
  const payouts = stakes.map((st, i) => st * prices[i]);
  const staked = sum(stakes);
  const minPayout = Math.min(...payouts);
  return {
    stakes,
    payouts,
    staked,
    minProfit: minPayout - staked,
    maxProfit: Math.max(...payouts) - staked,
  };
}

export function decimalToAmerican(d) {
  if (!(d > 1)) return '—';
  if (d >= 2) return `+${Math.round((d - 1) * 100)}`;
  return `${Math.round(-100 / (d - 1))}`;
}

export function formatOdds(d, format) {
  return format === 'decimal' ? d.toFixed(2) : decimalToAmerican(d);
}

/** Label for one leg, e.g. "Bills +2.5", "Over 47.5", "Draw". Props show side + number (player is in the title). */
export function legLabel(market, leg) {
  if (isPropMarket(market)) return leg.point === undefined || leg.point === null ? leg.name : `${leg.name} ${leg.point}`;
  if (market === 'spreads') {
    const p = Number(leg.point);
    return `${leg.name} ${p > 0 ? '+' : ''}${p === 0 ? 'PK' : p}`;
  }
  if (market === 'totals') return `${leg.name} ${leg.point}`;
  return leg.name;
}

/**
 * "Cover bets": cheap, normal-looking straight bets at each of your books, for mixing
 * recreational action in with arb bets. Uses the game-line odds already loaded (no credits).
 *
 * For each book it looks at that book's own 2-way markets (moneyline, spread, total) on games
 * that haven't started, and measures the book's margin on that line. The expected cost of a
 * bet is roughly stake x (1 - 1/sum(1/price)), so lower margin = cheaper cover bet.
 * It suggests the side recreational bettors usually take: the favourite, or the Over.
 *
 * @returns {{bookKey, bookTitle, picks: object[]}[]}
 */
export function findCoverBets(events, opts = {}) {
  const { allowBooks = null, now = Date.now(), maxAgeMinutes = 0, popularSports = null, perBook = 2 } = opts;
  const byBook = new Map();

  for (const ev of events || []) {
    const start = Date.parse(ev.commence_time);
    if (!Number.isFinite(start) || start <= now) continue;
    const popular = popularSports ? popularSports.has(ev.sport_key) : true;

    for (const bm of ev.bookmakers || []) {
      if (allowBooks && !allowBooks.has(bm.key)) continue;
      for (const m of bm.markets || []) {
        if (!(m.key in MARKET_LABELS)) continue;
        const updated = Date.parse(m.last_update || bm.last_update);
        if (maxAgeMinutes > 0 && Number.isFinite(updated) && now - updated > maxAgeMinutes * 60_000) continue;

        const lines = new Map();
        for (const o of m.outcomes || []) {
          if (!(Number(o.price) > 1)) continue;
          const line = groupLine(ev, m.key, o);
          if (line === null) continue;
          if (!lines.has(line)) lines.set(line, []);
          lines.get(line).push(o);
        }

        for (const [line, outs] of lines) {
          if (outs.length !== 2 || !coversEverything(m.key, outs.map((o) => o.name))) continue;
          const margin = 1 - 1 / sum(outs.map((o) => 1 / o.price));
          let pick;
          if (m.key === 'totals') pick = outs.find((o) => o.name === 'Over');
          else if (m.key === 'spreads') pick = outs.find((o) => o.point < 0) || outs[0];
          else pick = outs[0].price <= outs[1].price ? outs[0] : outs[1];

          if (!byBook.has(bm.key)) byBook.set(bm.key, { bookKey: bm.key, bookTitle: bm.title || bm.key, candidates: [] });
          byBook.get(bm.key).candidates.push({
            event: { id: ev.id, sportKey: ev.sport_key, sportTitle: ev.sport_title || ev.sport_key, home: ev.home_team, away: ev.away_team, commence: ev.commence_time },
            market: m.key,
            line,
            leg: { name: pick.name, point: pick.point, price: Number(pick.price) },
            margin,
            popular,
            link: pick.link || m.link || bm.link || null,
          });
        }
      }
    }
  }

  const out = [];
  for (const b of byBook.values()) {
    b.candidates.sort((x, y) => (y.popular - x.popular) || (x.margin - y.margin));
    const picks = [];
    const usedEvents = new Set();
    for (const c of b.candidates) {
      if (usedEvents.has(c.event.id)) continue;
      usedEvents.add(c.event.id);
      picks.push(c);
      if (picks.length >= perBook) break;
    }
    out.push({ bookKey: b.bookKey, bookTitle: b.bookTitle, picks });
  }
  out.sort((a, b) => a.bookTitle.localeCompare(b.bookTitle));
  return out;
}
