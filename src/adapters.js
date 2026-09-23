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
  const map = Object.create(null);
  for (const [canonical, list] of Object.entries(aliases)) {
    for (const a of list) map[String(a).toLowerCase().trim()] = canonical;
  }
  return map;
}

/**
 * THE single canonicalisation point for timestamps.
 * Accepts epoch ms (including fractional), epoch s, ISO 8601, or a Date, and
 * returns INTEGER epoch milliseconds (or null).
 * Both the adapter and every test import THIS — there is no per-call-site
 * rounding anywhere else in the codebase.
 */
function toEpochMs(v) {
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

/** @deprecated alias kept for callers written before the rename. */
const parseTimestamp = toEpochMs;

/** Minimal RFC4180-ish CSV parser: handles quotes, escaped quotes, CRLF. */
function parseCSV(text, delimiter = ',') {
  text = text.replace(/^\uFEFF/, '');
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
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* ignore */ }
    else field += c;
  }
  if (inQuotes) throw new Error('Unclosed quote in CSV input');
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter(r => r.some(f => String(f).trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map(h => String(h).trim());
  if (header.some(h => !h) || new Set(header.map(h => h.toLowerCase())).size !== header.length) throw new Error('CSV headers must be unique and non-empty.');
  if (nonEmpty.slice(1).some(r => r.length !== header.length)) throw new Error('CSV row has a different number of columns from the header. Quote amounts containing commas.');
  return nonEmpty.slice(1).map(r => {
    const o = Object.create(null);
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
  const unmapped = Object.create(null);
  const rejected = { badTimestamp: 0, missingAction: 0 };

  // `issues` keeps the OFFENDING ROWS themselves, so callers can fail loudly
  // instead of silently skipping malformed input.
  const issues = [];
  rows.forEach((r, index) => {
    const ts = toEpochMs(cm.ts != null ? r[cm.ts] : undefined);
    if (ts === null || !Number.isFinite(ts) || !Number.isFinite(new Date(ts).getTime())) {
      rejected.badTimestamp++;
      issues.push({ index, reason: 'unparseable timestamp', value: cm.ts != null ? r[cm.ts] : '(no timestamp column mapped)', row: r });
      return;
    }
    const rawAction = String((cm.action != null ? r[cm.action] : '') ?? '').toLowerCase().trim();
    const action = aliasMap[rawAction];
    if (!action) {
      if (!rawAction) rejected.missingAction++;
      else unmapped[rawAction] = (unmapped[rawAction] || 0) + 1;
      issues.push({ index, reason: rawAction ? `unrecognised action "${rawAction}"` : 'blank action', value: rawAction || '(blank)', row: r });
      return;
    }
    const num = k => {
      if (k == null) return undefined;
      const raw = String(r[k] ?? '').trim();
      if (raw === '') return undefined;          // blank cell -> absent, NOT 0
      const cleaned = raw.replace(/^[£$€]/, '');
      const v = /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(cleaned) ? Number(cleaned.replace(/,/g, '')) : NaN;
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
      _payoutAvailable: !!cm.payout,
    });
  });

  events.sort((a, b) => a.ts - b.ts);

  // derive sessions + gaps (a gap larger than sessionGapSec starts a new session)
  const lastSeen = Object.create(null);
  const sessionNumbers = Object.create(null);
  for (const e of events) {
    const prev = lastSeen[e.userId];
    if (prev) {
      const gap = Math.round((e.ts - prev.ts) / 1000);
      e.gapSec = gap;
      if (e.sessionId === undefined) {
        e.sessionId = (gap > sessionGapSec || prev.action === 'logout')
          ? `${e.userId}-S${(sessionNumbers[e.userId] = (sessionNumbers[e.userId] || 0) + 1)}`
          : prev.sessionId;
      }
    } else {
      if (e.sessionId === undefined) {
        sessionNumbers[e.userId] = (sessionNumbers[e.userId] || 0) + 1;
        e.sessionId = `${e.userId}-S${sessionNumbers[e.userId]}`;
      }
    }
    lastSeen[e.userId] = e;
  }

  return { events, unmapped, rejected, issues, rowsIn: rows.length };
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


/* ---------------- column auto-detection + structural gate ---------------- */

const COLUMN_CANDIDATES = {
  ts:        ['ts', 'timestamp', 'event_time', 'event_time_ms', 'eventtime', 'time', 'datetime', 'date', 'occurred_at'],
  userId:    ['userId', 'user_id', 'userid', 'uid', 'player', 'player_id', 'playerid', 'account', 'account_id', 'user'],
  action:    ['action', 'event_type', 'eventtype', 'event', 'type', 'event_name', 'name'],
  money:     ['amount', 'stake', 'wager', 'bet_amount', 'bet', 'payout', 'win_amount', 'value', 'money'],
  sessionId: ['sessionId', 'session_id', 'sessionid', 'session', 'sid'],
};

/**
 * Best-effort column mapping from the actual headers. Pass `overrides` to pin
 * any field explicitly. A single detected money column feeds stake+payout+amount
 * (the adapter only reads the one relevant to each action).
 */
const STAKE_CANDIDATES  = ['stake', 'wager', 'bet_amount', 'betamount', 'bet', 'amount', 'value', 'money'];
const PAYOUT_CANDIDATES = ['payout', 'win_amount', 'winamount', 'return', 'returned', 'prize', 'cashout', 'credit'];
const AMOUNT_CANDIDATES = ['amount', 'transaction_amount', 'deposit_amount', 'value', 'money'];

function detectColumns(rows, overrides = {}) {
  const keys = rows.length ? Object.keys(rows[0]) : [];
  const lower = new Map(keys.map(k => [String(k).toLowerCase(), k]));
  const find = list => { for (const c of list) { const hit = lower.get(c.toLowerCase()); if (hit) return hit; } return undefined; };
  // NOTE: `payout` is deliberately NOT defaulted to the stake column. Guessing it
  // would make a win-row read the stake field and silently fabricate payouts.
  const stake = overrides.stake ?? find(STAKE_CANDIDATES) ?? find(['amount', 'value', 'money']);
  return {
    ts:        overrides.ts        ?? find(COLUMN_CANDIDATES.ts),
    userId:    overrides.userId    ?? find(COLUMN_CANDIDATES.userId),
    action:    overrides.action    ?? find(COLUMN_CANDIDATES.action),
    stake:     stake,
    payout:    overrides.payout    ?? find(PAYOUT_CANDIDATES),
    amount:    overrides.amount    ?? find(AMOUNT_CANDIDATES) ?? stake,
    sessionId: overrides.sessionId ?? find(COLUMN_CANDIDATES.sessionId),
  };
}

/**
 * Structural gate: THROWS with a readable explanation if the export cannot be
 * read at all, rather than returning an empty result that looks like success.
 */
function assertSchema(columnMap, rows, source = 'input') {
  const missing = [];
  if (!columnMap.ts) missing.push('timestamp (ts / timestamp / event_time)');
  if (!columnMap.action) missing.push('action (action / event_type / event)');
  if (!rows.length) missing.push('no data rows');
  if (missing.length) {
    throw new Error(
      `SCHEMA ERROR in ${source} — cannot map: ${missing.join('; ')}. ` +
      `Columns seen: ${rows.length ? Object.keys(rows[0]).join(', ') : '(none)'}. ` +
      `Pass an explicit columnMap if your headers differ.`
    );
  }
}

module.exports = {
  ACTIONS, OUTCOMES, DEFAULT_ACTION_ALIASES, COLUMN_CANDIDATES,
  toEpochMs, parseTimestamp, parseCSV, normalise, fromCSV, fromJSON,
  detectColumns, assertSchema, qualityReport,
};
