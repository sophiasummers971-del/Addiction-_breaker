/**
 * adapter_demo.js — ROUND-TRIP FIDELITY TEST for the real-data adapter.
 *
 * Method: build a canonical cohort, re-serialise it into the messy shapes a real
 * export actually has, push it back through the adapter, compare field-by-field.
 *
 * TIMESTAMP PRECISION — the honest part:
 * The generator emits fractional-ms floats (…429.891). Every serialisation
 * format preserves a DIFFERENT amount of that:
 *   - epoch SECONDS  floors to the second
 *   - ISO 8601       truncates sub-millisecond digits
 *   - raw JSON ms    keeps the full number
 * So the expected value for each row is derived from what was ACTUALLY put on
 * the wire, passed through the SAME shared `toEpochMs()` the adapter uses.
 * There is no per-call-site rounding anywhere, and the test never asserts a
 * precision the source format never carried.
 */
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'output');
const { generateUserLog } = require('../src/simulate');
const { fromCSV, fromJSON, qualityReport, toEpochMs } = require('../src/adapters');
const { analyzeUser, hookScore } = require('../src/model');

let canonical = [];
for (let i = 0; i < 3; i++) canonical = canonical.concat(generateUserLog(`real-${i + 1}`, 'addicted-pattern', 20, 9000 + i * 41));
canonical.sort((a, b) => a.ts - b.ts);
console.log(`canonical cohort: ${canonical.length} events, ${new Set(canonical.map(e => e.userId)).size} users\n`);

const ALIAS = { login: 'signin', deposit: 'topup', bet: 'spin', win: 'cashout', loss: 'lose', near_miss: 'almost', withdraw: 'redeem', logout: 'signout' };
// key uses the SHARED canonicalised ts — never a raw float
const key = e => [toEpochMs(e.ts), e.userId, e.action, e.stake ?? null, e.payout ?? null, e.amount ?? null].join('|');
const keysOf = evs => evs.map(key).sort();
const firstDiff = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return { i, got: a[i], want: b[i] }; return null; };

/* ---- CASE A: messy CSV (aliased actions, mixed ts formats, session kept) ---- */
const wireTsA = [];
function toMessyCSV(events) {
  const lines = ['event_time,player,event_type,amount,session_id'];
  events.forEach((e, i) => {
    // alternate the two most common real-world timestamp encodings
    const wire = i % 2 === 0 ? Math.floor(e.ts / 1000) : new Date(e.ts).toISOString();
    wireTsA.push(wire);
    const amt = e.stake ?? e.payout ?? e.amount ?? '';
    lines.push([wire, e.userId, ALIAS[e.action], amt, e.sessionId].join(','));
  });
  return lines.join('\n');
}
const csvA = toMessyCSV(canonical);
const resA = fromCSV(csvA, { columnMap: { ts: 'event_time', userId: 'player', action: 'event_type', stake: 'amount', payout: 'amount', amount: 'amount', sessionId: 'session_id' } });
const qA = qualityReport(resA);
// expected = canonical fields, ts taken from what was actually written to the wire
const expectedA = canonical.map((e, i) => key({ ...e, ts: wireTsA[i] })).sort();
const keysA = keysOf(resA.events);
const exactA = keysA.length === expectedA.length && keysA.every((k, i) => k === expectedA[i]);

console.log('═══ CASE A — messy CSV: aliased actions, epoch-seconds + ISO mixed, session kept ═══');
console.log(`  rows in: ${qA.rowsIn}   mapped: ${qA.mapped} (${(qA.mappedPct * 100).toFixed(1)}%)`);
console.log(`  events by action:`, qA.eventsByAction);
console.log(`  sessions: canonical ${new Set(canonical.map(e => e.sessionId)).size} -> adapted ${qA.sessions}`);
console.log(`  warnings: ${qA.warnings.length ? qA.warnings.join(' | ') : 'none'}`);
console.log(`  ROUND-TRIP: ${exactA ? '✅ EXACT MATCH on all ' + expectedA.length + ' events' : '❌ MISMATCH'}`);
if (!exactA) { const d = firstDiff(keysA, expectedA); console.log('    first diff at', d.i, '\n     adapted:  ', d.got, '\n     expected: ', d.want); }

/* ---- CASE B: no session column, junk rows injected ---- */
const stripped = canonical.map(e => ({ ts: e.ts, userId: e.userId, action: e.action, stake: e.stake, payout: e.payout, amount: e.amount }));
const junk = [
  { ts: canonical[10].ts + 5, userId: 'real-1', action: 'click', stake: undefined },
  { ts: canonical[11].ts + 5, userId: 'real-1', action: 'view_advert', stake: undefined },
  { ts: 'not-a-timestamp', userId: 'real-1', action: 'bet', stake: 5 },
  { ts: Math.floor(canonical[12].ts / 1000), userId: 'real-2', action: '', stake: undefined },
];
const lossy = stripped.concat(junk).sort((a, b) => (typeof a.ts === 'number' ? a.ts : 0) - (typeof b.ts === 'number' ? b.ts : 0));
const resB = fromJSON(lossy, { columnMap: { ts: 'ts', userId: 'userId', action: 'action', stake: 'stake', payout: 'payout', amount: 'amount' } });
const qB = qualityReport(resB);
const expectedB = keysOf(canonical);        // same helper; adapter rounds the same way
const keysB = keysOf(resB.events);
const exactB = keysB.length === expectedB.length && keysB.every((k, i) => k === expectedB[i]);

console.log('\n═══ CASE B — no session column, 4 junk rows injected ═══');
console.log(`  rows in: ${qB.rowsIn}  ->  mapped: ${qB.mapped}   dropped: ${qB.rowsIn - qB.mapped}`);
console.log(`  unmapped actions:`, qB.unmappedActions);
console.log(`  rejected:`, qB.rejected);
console.log(`  offending rows kept for inspection: ${resB.issues.length}`);
for (const iss of resB.issues) console.log(`    row ${iss.index}: ${iss.reason}  (value: ${JSON.stringify(iss.value)})`);
console.log(`  session ids DERIVED from time gaps: ${qB.sessions} sessions`);
console.log(`  ROUND-TRIP (surviving rows): ${exactB ? '✅ EXACT MATCH on all ' + expectedB.length + ' canonical events' : '❌ MISMATCH'}`);
if (!exactB) { const d = firstDiff(keysB, expectedB); console.log('    first diff at', d.i, '\n     adapted:  ', d.got, '\n     expected: ', d.want); }

/* ---- downstream value preservation ---- */
const adaptedUser = [...new Set(resB.events.map(e => e.userId))][0];
const stats = analyzeUser(resB.events, adaptedUser);
const score = hookScore(stats);
const canonStake = canonical.filter(e => e.userId === adaptedUser && e.action === 'bet').reduce((a, b) => a + (b.stake || 0), 0);
console.log('\n═══ downstream on adapted data ═══');
console.log(`  analyzeUser(${adaptedUser}): bets=${stats.totalBets} sessions=${stats.sessions} RTP=${stats.actualRTP}%  HookScore=${score}`);
console.log(`  total staked: canonical $${canonStake.toFixed(2)} vs adapted $${stats.totalStaked.toFixed(2)} -> ${Math.abs(canonStake - stats.totalStaked) < 0.01 ? '✅ identical' : '❌ differs'}`);

fs.writeFileSync(path.join(OUT, 'adapter_results.json'), JSON.stringify({
  canonicalEvents: canonical.length,
  caseA: { rowsIn: qA.rowsIn, mapped: qA.mapped, exactRoundTrip: exactA, warnings: qA.warnings },
  caseB: { rowsIn: qB.rowsIn, mapped: qB.mapped, dropped: qB.rowsIn - qB.mapped, unmapped: qB.unmappedActions, rejected: qB.rejected, offendingRows: resB.issues.length, exactRoundTrip: exactB, warnings: qB.warnings },
  downstream: { user: adaptedUser, hookScore: score, canonicalStake: canonStake, adaptedStake: stats.totalStaked },
}, null, 2));
console.log('\nWrote output/adapter_results.json');
