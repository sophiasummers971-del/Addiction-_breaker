/**
 * adapters.js — bring REAL event logs into the engine.
 *
 * The whole downstream stack (metrics, Hook Score, recovery math, journal,
 * Markov models) expects one canonical event shape. Real exports never look
 * like that: column names vary, timestamps come in three formats, "bet" is
 * called wager/spin/play, session IDs are missing, and half the rows are
 * actions nobody cares about.
 *
 * This module normalises all of that and — critically — REPORTS what it did,
 * so you can see which rows it could not map instead of silently dropping them
 * and quietly changing every number downstream.
 *
 * Canonical event (the target shape):
 *   { ts, userId, action, stake?, payout?, amount?, hour, sessionId, gapSec }
 */

const ACTIONS = ['login', 'deposit', 'bet', 'win', 'loss', 'near_miss', 'withdraw', 'logout'];

/** Result-bearing actions — the ones a Markov model over outcomes needs. */
const OUTCOMES = ['win', 'loss', 'near_miss'];

/** Common real-world spellings -> canonical action. Extend per source. */
const DEFAULT_ACTION_ALIASES = {
  login: ['login', 'signin', 'sign_in', 'session_start', 'open', 'launch', 'auth'],
  deposit: ['deposit', 'topup', 'top_up', 'fund', 'payment', 'purchase', 'buy_in'],
  bet: ['bet', 'wager', 'spin', 'play', 'stake', 'round', 'hand', 'game_start'],
  win: ['win', 'payout', 'cashout', 'win_result', 'success'],
  loss: ['loss', 'lose', 'lose_result', 'fail'],
  near_miss: ['near_miss', 'nearmiss', 'almost', 'close_win', 'near'],
  withdraw: ['withdraw', 'withdrawal', 'cash_out', 'redeem', 'payout_request'],
  logout: ['logout', 'signout', 'sign_out', 'session_end', 'close', 'exit'],
};

function invertAliases(aliases) {
  const map = {};
  for (const [canonical, list] of Object.entries(aliases)) {
    for (const a of list) map[String(a).toLowerCase().trim()] = canonical;
  }
  return map;
}

/** Accept epoch ms, epoch s, ISO 8601, or a Date. Returns epoch ms or null. */
function parseTimestamp(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'number') {
    // < 1e12 → seconds; else ms
    return v < 1e12 ? Math.round(v * 1000) : Math.round(v);
  }
  const s = String(v).trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n < 1e12 ? Math.round(n * 1000) : Math.round(n);
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Minimal RFC4180-ish CSV parser: handles quotes, escaped quotes, CRLF. */
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* ignore */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter(r => r.some(f => String(f).trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map(h => String(h).trim());
  return nonEmpty.slice(1).map(r => {
    const o = {};
    header.forEach((h, i) => { o[h] = r[i] === undefined ? '' : r[i]; });
    return o;
  });
}

/**
 * Normalise rows -> canonical events.
 *
 * @param rows  array of plain objects (already parsed)
 * @param opts  {
 *   columnMap:  { ts, userId, action, stake, payout, amount, sessionId }
 *   aliases:    action alias map (defaults provided)
 *   defaultUserId,
 *   sessionGapSec  gap that starts a new session when no sessionId exists (default 1800)
 * }
 */
function normalise(rows, opts = {}) {
  const cm = opts.columnMap || {};
  const aliasMap = invertAliases(opts.aliases || DEFAULT_ACTION_ALIASES);
  const defaultUserId = opts.defaultUserId ?? 'unknown-user';
  const sessionGapSec = opts.sessionGapSec ?? 1800;

  const events = [];
  const unmapped = {};
  const rejected = { badTimestamp: 0, missingAction: 0 };

  for (const r of rows) {
    const ts = parseTimestamp(r[cm.ts]);
    if (ts === null) { rejected.badTimestamp++; continue; }
    const rawAction = String(r[cm.action] ?? '').toLowerCase().trim();
    const action = aliasMap[rawAction];
    if (!action) {
      if (!rawAction) rejected.missingAction++;
      else unmapped[rawAction] = (unmapped[rawAction] || 0) + 1;
      continue;
    }
    const num = k => {
      if (k == null) return undefined;
      const raw = String(r[k] ?? '').trim();
      if (raw === '') return undefined;          // blank cell -> absent, NOT 0
      const v = Number(raw.replace(/[^0-9.\-]/g, ''));
      return Number.isFinite(v) ? v : undefined;
    };
    const userId = String(r[cm.userId] ?? '').trim() || defaultUserId;
    const sessionId = cm.sessionId ? String(r[cm.sessionId] ?? '').trim() || undefined : undefined;

    events.push({
      ts, userId, action,
      stake: action === 'bet' ? num(cm.stake) : undefined,
      payout: action === 'win' ? num(cm.payout) : undefined,
      amount: (action === 'deposit' || action === 'withdraw') ? num(cm.amount) : undefined,
      hour: new Date(ts).getUTCHours(),
      sessionId,
      gapSec: null,
      _sourceRow: r,
    });
  }

  events.sort((a, b) => a.ts - b.ts);

  // derive sessions + gaps (a gap larger than sessionGapSec starts a new session)
  const lastSeen = {};
  for (const e of events) {
    const prev = lastSeen[e.userId];
    if (prev) {
      const gap = Math.round((e.ts - prev.ts) / 1000);
      e.gapSec = gap;
      if (e.sessionId === undefined) {
        e.sessionId = (gap > sessionGapSec || prev.action === 'logout')
          ? `${e.userId}-S${(lastSeen[e.userId + ':n'] = (lastSeen[e.userId + ':n'] || 0) + 1)}`
          : prev.sessionId;
      }
    } else {
      if (e.sessionId === undefined) {
        lastSeen[e.userId + ':n'] = (lastSeen[e.userId + ':n'] || 0) + 1;
        e.sessionId = `${e.userId}-S${lastSeen[e.userId + ':n']}`;
      }
    }
    lastSeen[e.userId] = e;
  }

  return { events, unmapped, rejected, rowsIn: rows.length };
}

/** Adapter for a CSV export. */
function fromCSV(text, opts = {}) {
  const rows = parseCSV(text);
  return { ...normalise(rows, opts), rowsIn: rows.length };
}

/** Adapter for a JSON array (or {events:[...]}) with a column map. */
function fromJSON(json, opts = {}) {
  const rows = Array.isArray(json) ? json : (json.events || json.rows || []);
  return normalise(rows, opts);
}

/**
 * Data-quality report. This is not decoration — it is the difference between
 * "the model says X" and "the model says X, on 61% of your rows, and here is
 * what happened to the other 39%."
 */
function qualityReport(result) {
  const { events, unmapped, rejected, rowsIn } = result;
  const byAction = {};
  for (const e of events) byAction[e.action] = (byAction[e.action] || 0) + 1;
  const users = new Set(events.map(e => e.userId));
  const sessions = new Set(events.map(e => e.sessionId));
  const mapped = events.length;
  const unmappedTotal = Object.values(unmapped).reduce((a, b) => a + b, 0);
  const outcomes = events.filter(e => OUTCOMES.includes(e.action)).length;

  const warnings = [];
  if (rowsIn && mapped / rowsIn < 0.9) warnings.push(`only ${((mapped / rowsIn) * 100).toFixed(1)}% of rows mapped to a known action`);
  if (unmappedTotal) warnings.push(`${unmappedTotal} rows dropped on unrecognised actions: ${Object.keys(unmapped).slice(0, 6).join(', ')}`);
  if (rejected.badTimestamp) warnings.push(`${rejected.badTimestamp} rows had an unparseable timestamp`);
  if (!outcomes) warnings.push('NO outcome rows — next-action models will have nothing to predict');
  if (events.some(e => e.action === 'bet' && (e.stake === undefined || Number.isNaN(e.stake)))) warnings.push('some bet rows have no stake — stake-escalation metrics will be partial');

  return {
    rowsIn, mapped, mappedPct: rowsIn ? mapped / rowsIn : 0,
    unmappedActions: unmapped, rejected,
    users: users.size, sessions: sessions.size,
    eventsByAction: byAction, outcomeRows: outcomes,
    warnings,
  };
}

module.exports = {
  ACTIONS, OUTCOMES, DEFAULT_ACTION_ALIASES,
  parseTimestamp, parseCSV, normalise, fromCSV, fromJSON, qualityReport,
};
