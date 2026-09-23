'use strict';
/**
 * ingest.js — the data/ ingest path.
 *
 * Contract (see data/README.md):
 *   - accepts .csv / .tsv / .txt (headered) and .json (array, or {events|data|rows|records|logs:[...]})
 *   - expands literal paths, directories and `*` patterns in the basename
 *   - auto-detects columns, or takes an explicit columnMap
 *   - THROWS loudly on unusable input, naming the offending row — it never
 *     returns an empty result that looks like a successful ingest
 */
const fs = require('fs');
const path = require('path');
const {
  parseCSV, fromCSV, fromJSON, detectColumns, assertSchema, qualityReport,
} = require('./adapters');
const { analyzeUser, hookScore } = require('./model');

const SUPPORTED = ['.csv', '.tsv', '.txt', '.json'];
const JSON_KEYS = ['events', 'data', 'rows', 'records', 'logs'];
/** Payday-cluster window used by the simulator: days 1-3 and 28-31 (UTC). */
const PRESSURE_DAYS = new Set([1, 2, 3, 28, 29, 30, 31]);

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (SUPPORTED.includes(path.extname(name).toLowerCase())) out.push(full);
  }
  return out;
}

/** Expand patterns (file / dir / wildcard) into a deduped, sorted file list. */
function expandPatterns(patterns, cwd = process.cwd()) {
  const files = new Set();
  for (const p of patterns) {
    const abs = path.isAbsolute(p) ? p : path.join(cwd, p);
    const dir = path.dirname(abs);
    const base = path.basename(abs);
    // Wildcards are resolved FIRST: the literal path legitimately does not exist.
    if (base.includes('*')) {
      if (!fs.existsSync(dir)) throw new Error(`ingest: directory not found: ${dir}`);
      const rx = new RegExp('^' + base.split('*').map(escapeRe).join('.*') + '$', 'i');
      let hits = 0;
      for (const name of fs.readdirSync(dir).sort()) {
        if (rx.test(name) && SUPPORTED.includes(path.extname(name).toLowerCase())) { files.add(path.join(dir, name)); hits++; }
      }
      if (!hits) throw new Error(`ingest: pattern matched no supported files: ${p}`);
      continue;
    }
    if (!fs.existsSync(abs)) throw new Error(`ingest: path not found: ${p}`);
    if (fs.statSync(abs).isDirectory()) { walk(abs).forEach(f => files.add(f)); continue; }
    files.add(abs);
  }
  return [...files].sort();
}

/** Read one file into raw rows (array of objects). Throws loudly on malformed files. */
function readRows(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (e) { throw new Error(`ingest: cannot read ${file}: ${e.message}`); }
  if (!text.trim()) throw new Error(`ingest: ${file} is empty`);
  const ext = path.extname(file).toLowerCase();
  if (ext === '.json') {
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { throw new Error(`ingest: ${file} is not valid JSON: ${e.message}`); }
    let arr = parsed;
    if (!Array.isArray(parsed)) {
      const key = JSON_KEYS.find(k => parsed && Array.isArray(parsed[k]));
      if (!key) throw new Error(`ingest: ${file} — expected a JSON array or an object with one of: ${JSON_KEYS.join(', ')}`);
      arr = parsed[key];
    }
    if (!arr.length) throw new Error(`ingest: ${file} contains no records`);
    return arr;
  }
  const parsed = parseCSV(text, ext === '.tsv' ? '\t' : ',');
  const rows = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.rows) ? parsed.rows : null);
  if (!rows) throw new Error(`ingest: ${file} — CSV parser returned no row array`);
  return rows;
}

/**
 * Ingest one or more paths into a single canonical event stream.
 * opts: { columnMap, strict, cwd, source }
 */
function ingest(inputs, opts = {}) {
  const patterns = Array.isArray(inputs) ? inputs : [inputs];
  const files = expandPatterns(patterns, opts.cwd);
  if (!files.length) throw new Error(`ingest: no supported files (${SUPPORTED.join(', ')}) found in: ${patterns.join(', ')}`);

  const perFile = [];
  const issues = [];
  const warnings = [];
  let events = [];

  for (const file of files) {
    const rows = readRows(file);
    const columnMap = opts.columnMap || detectColumns(rows);
    assertSchema(columnMap, rows, file);            // loud structural gate
    const ext = path.extname(file).toLowerCase();
    const res = fromJSON(rows, { columnMap });
    const q = qualityReport(res);
    if (!columnMap.payout) {
      // Honest failure mode: without a win/return column RTP is UNCOMPUTABLE.
      // Report it loudly instead of silently publishing a fake 0% RTP.
      warnings.push(`${path.basename(file)}: no payout/win column mapped — RTP and returned totals are UNCOMPUTABLE from this file (pass --map to point at one)`);
    }
    const fileIssues = (res.issues || []).map(i => ({ ...i, file }));
    issues.push(...fileIssues);
    warnings.push(...q.warnings.map(w => `${path.basename(file)}: ${w}`));
    perFile.push({ file, format: ext.slice(1), rowsIn: q.rowsIn, mapped: q.mapped, dropped: q.rowsIn - q.mapped, issues: fileIssues.length, eventsByAction: q.eventsByAction, sessions: q.sessions });
    events = events.concat(res.events);
  }

  events.sort((a, b) => a.ts - b.ts);
  if (!events.length) throw new Error(`ingest: files were readable but produced 0 usable events. First issue: ${issues.length ? issues[0].reason : 'unknown'}`);

  if (opts.strict && issues.length) {
    const details = issues.slice(0, 10).map(i => `  • ${path.basename(i.file)} row ${i.index}: ${i.reason} (value: ${JSON.stringify(i.value)})`).join('\n');
    throw new Error(`ingest: --strict — ${issues.length} unusable row(s) must be fixed before analysis:\n${details}`);
  }

  return { events, files: perFile, issues, warnings, totals: { files: files.length, rowsIn: perFile.reduce((a, b) => a + b.rowsIn, 0), events: events.length, users: new Set(events.map(e => e.userId)).size } };
}

const utcDay = ts => new Date(ts).getUTCDate();
const hourOf = ts => new Date(ts).getUTCHours();

/** Per-user behavioural profile computed straight off the ingested stream. */
function summarise(events) {
  const users = [...new Set(events.map(e => e.userId))].sort();
  return users.map(u => {
    const stats = analyzeUser(events, u);
    const mine = events.filter(e => e.userId === u);
    const bets = mine.filter(e => e.action === 'bet');
    const deposits = mine.filter(e => e.action === 'deposit');
    const pressure = deposits.filter(e => PRESSURE_DAYS.has(utcDay(e.ts))).length;
    const night = bets.filter(e => { const h = e.hour != null ? e.hour : hourOf(e.ts); return h >= 22 || h < 6; }).length;
    const chase = stats.lossChase || {};
    const stakesKnown = bets.length > 0 && bets.every(e => Number.isFinite(e.stake));
    const returnsKnown = mine.every(e => e._payoutAvailable !== false) && mine.filter(e => ['win','loss','near_miss'].includes(e.action)).length >= bets.length && mine.filter(e => e.action === 'win').every(e => Number.isFinite(e.payout));
    return {
      user: u,
      events: mine.length,
      sessions: stats.sessions,
      bets: stats.totalBets,
      staked: stakesKnown ? stats.totalStaked : null,
      returned: returnsKnown ? stats.totalReturned : null,
      rtp: stakesKnown && returnsKnown ? stats.actualRTP : null,
      hook: stakesKnown && stats.losses && stats.wins ? hookScore(stats) : null,
      deposits: deposits.length,
      pressureShare: deposits.length ? pressure / deposits.length : null,
      nightShare: bets.length ? night / bets.length : null,
      pReBetAfterLoss30s: stats.losses ? chase.pReBetAfterLoss30s : null,
      pReBetAfterWin30s: stats.wins ? chase.pReBetAfterWin30s : null,
    };
  });
}

/** Top action→action transitions across the merged stream (the dependency, counted). */
function topTransitions(events, n = 6) {
  const byUser = new Map();
  for (const e of events) { if (!byUser.has(e.userId)) byUser.set(e.userId, []); byUser.get(e.userId).push(e); }
  const counts = new Map();
  for (const arr of byUser.values()) {
    arr.sort((a, b) => a.ts - b.ts);
    for (let i = 1; i < arr.length; i++) {
      const k = `${arr[i - 1].action} → ${arr[i].action}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ transition: k, count: v, p: total ? v / total : 0 }));
}

module.exports = { ingest, summarise, topTransitions, expandPatterns, readRows, PRESSURE_DAYS, SUPPORTED };
