#!/usr/bin/env node
'use strict';
/** Zero-dependency test suite. Exits non-zero if any assertion fails. */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'output');
const { toEpochMs, detectColumns, assertSchema } = require('../src/adapters');
const { ingest } = require('../src/ingest');
const { generateUserLog } = require('../src/simulate');
const { analyzeUser, hookScore } = require('../src/model');

let pass = 0, fail = 0;
const results = [];
function t(name, fn) {
  try { fn(); pass++; results.push(`  PASS  ${name}`); }
  catch (e) { fail++; results.push(`  FAIL  ${name}\n          -> ${e.message}`); }
}
const eq = (a, b, msg) => { if (a !== b) throw new Error(`${msg || 'expected'} ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg || 'expected truthy'); };

console.log('=== test suite ===');

t('toEpochMs canonicalises fractional epoch-ms to an integer', () => {
  const v = toEpochMs(1788224725429.891);
  eq(v, 1788224725430, 'rounded ms');
  ok(Number.isInteger(v), 'must be an integer');
});
t('toEpochMs handles epoch-seconds, ISO 8601, Date, null and garbage', () => {
  eq(toEpochMs('1788224725'), 1788224725000);
  eq(toEpochMs('2026-09-01T01:05:25.429Z'), 1788224725429);
  eq(toEpochMs(new Date(1788224725429.891)), 1788224725429);
  eq(toEpochMs(null), null);
  eq(toEpochMs('not-a-timestamp'), null);
});
t('detectColumns maps underscore / renamed headers', () => {
  const cm = detectColumns([{ event_time: '', player_id: '', event_type: '', amount: '', session_id: '' }]);
  eq(cm.ts, 'event_time'); eq(cm.userId, 'player_id'); eq(cm.action, 'event_type'); eq(cm.sessionId, 'session_id');
});
t('detectColumns never aliases payout onto the stake column', () => {
  const cm = detectColumns([{ ts: '', action: '', stake: '' }]);
  eq(cm.stake, 'stake'); eq(cm.payout, undefined, 'payout');
});
t('detectColumns finds a real payout column when present', () => {
  const cm = detectColumns([{ event_time: '', event_type: '', stake: '', payout: '' }]);
  eq(cm.payout, 'payout', 'payout');
});
t('assertSchema throws SCHEMA ERROR instead of returning an empty result', () => {
  let msg = '';
  try { assertSchema({ action: 'event_type' }, [{ event_type: 'bet' }], 'fixture.csv'); } catch (e) { msg = e.message; }
  ok(/SCHEMA ERROR/.test(msg), `message should say SCHEMA ERROR, got: ${msg}`);
});

// Case A + Case B: recompute for real, then assert on the produced JSON
t('adapter round-trip (Case A + Case B) recomputes to exact fidelity', () => {
  execFileSync('node', [path.join(ROOT, 'scripts', 'adapter_demo.js')], { cwd: ROOT, stdio: 'pipe' });
  const r = JSON.parse(fs.readFileSync(path.join(OUT, 'adapter_results.json'), 'utf8'));
  eq(r.caseA.exactRoundTrip, true, 'Case A exact round-trip');
  eq(r.caseB.exactRoundTrip, true, 'Case B exact round-trip');
  eq(r.caseB.dropped, 4, 'Case B dropped rows');
  eq(r.caseB.offendingRows, 4, 'Case B offending rows captured');
  ok(Math.abs(r.downstream.canonicalStake - r.downstream.adaptedStake) < 0.01, 'stake preserved to the cent');
});

t('ingest merges the committed sample CSV + JSON into one clean stream', () => {
  const res = ingest([path.join(ROOT, 'data', 'sample_export.csv'), path.join(ROOT, 'data', 'sample_export.json')]);
  ok(res.events.length > 0, 'events');
  eq(res.totals.files, 2, 'files read');
  ok(res.totals.users >= 5, `expected >=5 users, got ${res.totals.users}`);
  eq(res.issues.length, 0, 'clean samples must have no issues');
  eq(res.warnings.length, 0, 'clean samples with a payout column must have no warnings');
});
t('ingest resolves a wildcard pattern', () => {
  const res = ingest([path.join(ROOT, 'data', 'sample_export.cs*')]);
  eq(res.totals.files, 1, 'files matched by glob');
  ok(res.totals.events > 0, 'events');
});
t('ingest --strict fails loudly, naming each offending row', () => {
  let msg = '';
  try { ingest([path.join(ROOT, 'test', 'fixtures', 'sample_export_dirty.csv')], { strict: true }); }
  catch (e) { msg = e.message; }
  ok(/--strict/.test(msg), 'should mention --strict');
  ok(/row \d+:/.test(msg), `should name offending rows, got: ${msg}`);
});
t('ingest on a schema-less file throws SCHEMA ERROR', () => {
  const bad = path.join(ROOT, 'output', '_tmp_bad.csv');
  fs.writeFileSync(bad, 'alpha,beta\n1,2\n');
  let msg = '';
  try { ingest([bad]); } catch (e) { msg = e.message; }
  fs.unlinkSync(bad);
  ok(/SCHEMA ERROR/.test(msg), `expected SCHEMA ERROR, got: ${msg}`);
});
t('ingest warns loudly when no payout column is mapped (RTP uncomputable)', () => {
  const f = path.join(ROOT, 'output', '_tmp_nopayout.csv');
  fs.writeFileSync(f, 'ts,event_type,stake\n1788224725,spin,10\n1788224726,spin,10\n');
  const res = ingest([f]);
  fs.unlinkSync(f);
  ok(res.warnings.some(w => /UNCOMPUTABLE/.test(w)), `expected an UNCOMPUTABLE warning, got: ${JSON.stringify(res.warnings)}`);
});
t('hook score still separates casual from pattern archetypes', () => {
  let casual = [], pattern = [];
  for (let i = 0; i < 3; i++) casual = casual.concat(generateUserLog(`t-c${i}`, 'casual', 20, 100 + i));
  for (let i = 0; i < 3; i++) pattern = pattern.concat(generateUserLog(`t-p${i}`, 'addicted-pattern', 20, 500 + i));
  const avg = (evts, u) => hookScore(analyzeUser(evts, u));
  const cu = [...new Set(casual.map(e => e.userId))].map(u => avg(casual, u));
  const pu = [...new Set(pattern.map(e => e.userId))].map(u => avg(pattern, u));
  const mc = cu.reduce((a, b) => a + b, 0) / cu.length, mp = pu.reduce((a, b) => a + b, 0) / pu.length;
  ok(mp > mc + 15, `pattern avg ${mp.toFixed(1)} should clearly exceed casual avg ${mc.toFixed(1)}`);
});

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
