#!/usr/bin/env node
'use strict';
/**
 * The one command:  npm run ingest -- [paths...] [--strict] [--json] [--map '{"ts":"col"}']
 * Default path is data/. Prints the computed numbers per user.
 */
const path = require('path');
const { ingest, summarise, topTransitions } = require('../src/ingest');

function parseArgs(argv) {
  const out = { paths: [], strict: false, json: false, columnMap: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--strict') out.strict = true;
    else if (a === '--json') out.json = true;
    else if (a === '--map') out.columnMap = JSON.parse(argv[++i]);
    else out.paths.push(a);
  }
  if (!out.paths.length) out.paths = [path.join(__dirname, '..', 'data')];
  return out;
}

const pct = v => (v == null || Number.isNaN(v) ? '   n/a' : `${(v * 100).toFixed(1).padStart(5)}%`);
const num = v => (v == null ? 'n/a' : v);

function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log('═══ ALGORITHM MIRROR — ingest ═══');
  console.log(`source: ${opts.paths.join(', ')}${opts.strict ? '   [strict]' : ''}\n`);

  const res = ingest(opts.paths, { strict: opts.strict, columnMap: opts.columnMap });

  console.log(`files read: ${res.totals.files}   rows in: ${res.totals.rowsIn}   events out: ${res.totals.events}   users: ${res.totals.users}`);
  for (const f of res.files) {
    console.log(`  · ${path.basename(f.file)} [${f.format}]  ${f.rowsIn} rows → ${f.mapped} mapped, ${f.dropped} dropped, ${f.sessions} sessions`);
  }
  if (res.issues.length) {
    console.log(`\n  ${res.issues.length} unusable row(s) kept for inspection (not silently skipped):`);
    for (const i of res.issues.slice(0, 6)) console.log(`    • ${path.basename(i.file)} row ${i.index}: ${i.reason} (value: ${JSON.stringify(i.value)})`);
    if (res.issues.length > 6) console.log(`    … ${res.issues.length - 6} more`);
  }
  if (res.warnings.length) console.log(`  warnings: ${res.warnings.join(' | ')}`);

  const rows = summarise(res.events);
  const head = 'user'.padEnd(8) + 'events'.padStart(7) + 'sess'.padStart(6) + 'bets'.padStart(7) + 'staked'.padStart(11) + 'returned'.padStart(11) + 'RTP'.padStart(8) + 'hook'.padStart(6) + 'paydayDep'.padStart(11) + 'night'.padStart(8) + 'chase30s'.padStart(10);
  console.log('\n' + head);
  console.log('─'.repeat(head.length));
  for (const r of rows) {
    console.log(
      String(r.user).padEnd(8) +
      String(r.events).padStart(7) +
      String(num(r.sessions)).padStart(6) +
      String(num(r.bets)).padStart(7) +
      ('$' + Number(r.staked || 0).toFixed(0)).padStart(11) +
      ('$' + Number(r.returned || 0).toFixed(0)).padStart(11) +
      (num(r.rtp) + '%').padStart(8) +
      String(num(r.hook)).padStart(6) +
      pct(r.pressureShare).padStart(11) +
      pct(r.nightShare).padStart(8) +
      pct(r.pReBetAfterLoss30s).padStart(10)
    );
  }

  const avg = k => rows.reduce((a, b) => a + (b[k] || 0), 0) / (rows.length || 1);
  console.log(`\navg hook score: ${avg('hook').toFixed(1)}   avg RTP: ${avg('rtp').toFixed(1)}%`);

  console.log('\ntop action transitions across the ingested stream:');
  for (const t of topTransitions(res.events)) {
    console.log(`  ${t.transition.padEnd(22)} ${String(t.count).padStart(5)}  ${(t.p * 100).toFixed(1)}%`);
  }

  if (opts.json) console.log('\n' + JSON.stringify({ totals: res.totals, files: res.files, users: rows, transitions: topTransitions(res.events) }, null, 2));
}
main();
