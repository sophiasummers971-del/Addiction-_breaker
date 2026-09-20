/**
 * adapter_demo.js — ROUND-TRIP FIDELITY TEST for the real-data adapter.
 *
 * The adapter's whole job is to be lossless on the fields the engine consumes.
 * So we prove it: generate a canonical cohort, re-serialise it into the messy
 * shapes a real export actually has (aliased action names, two timestamp
 * formats, renamed columns, missing session ids, junk rows), run it back
 * through the adapter, and compare field-by-field against the original.
 *
 * If the adapter is faithful, the surviving rows match EXACTLY. If it silently
 * drops or mangles rows, this test fails — which is the point.
 */
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'output');
const { generateUserLog } = require('../src/simulate');
const { fromCSV, fromJSON, qualityReport } = require('../src/adapters');
const { analyzeUser, hookScore } = require('../src/model');

/* ---- canonical source cohort ---- */
let canonical = [];
for (let i = 0; i < 3; i++) canonical = canonical.concat(generateUserLog(`real-${i + 1}`, 'addicted-pattern', 20, 9000 + i * 41));
canonical.sort((a, b) => a.ts - b.ts);
console.log(`canonical cohort: ${canonical.length} events, ${new Set(canonical.map(e => e.userId)).size} users\n`);

const ALIAS = { login: 'signin', deposit: 'topup', bet: 'spin', win: 'cashout', loss: 'lose', near_miss: 'almost', withdraw: 'redeem', logout: 'signout' };
// NOTE ON PRECISION: half of Case A is serialised as epoch SECONDS, which
// inherently truncates milliseconds. So the canonical side is floored to the
// same second-granularity for those rows before comparison — the test must not
// claim a fidelity failure that is really the source format's own precision.
const key = e => [e.ts, e.userId, e.action, e.stake ?? null, e.payout ?? null, e.amount ?? null].join('|');
const keysOf = evs => evs.map(key).sort();
const keysOfSecondGranular = evs => evs.map(e => key({ ...e, ts: Math.floor(e.ts / 1000) * 1000 })).sort();
const keysCanonExact = keysOf(canonical);   // Case B keeps full ms, so compare exactly
const firstDiff = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return { i, got: a[i], want: b[i] }; return null; };

/* ---- CASE A: messy but faithful (session column present) ---- */
function toMessyCSV(events) {
  const lines = ['event_time,player,event_type,amount,session'];
  events.forEach((e, i) => {
    // mix two real-world timestamp formats in the same column
    const t = i % 2 === 0 ? Math.floor(e.ts / 1000) : new Date(e.ts).toISOString();
    const amt = e.stake ?? e.payout ?? e.amount ?? '';
    lines.push([t, e.userId, ALIAS[e.action], amt, e.sessionId].join(','));
  });
  return lines.join('\n');
}
const csvA = toMessyCSV(canonical);
const resA = fromCSV(csvA, { columnMap: { ts: 'event_time', userId: 'player', action: 'event_type', stake: 'amount', payout: 'amount', amount: 'amount', sessionId: 'session' } });
const qA = qualityReport(resA);
const keysA = keysOfSecondGranular(resA.events), keysCanon = keysOfSecondGranular(canonical);
const exactA = keysA.length === keysCanon.length && keysA.every((k, i) => k === keysCanon[i]);

console.log('═══ CASE A — messy CSV, two timestamp formats, aliased actions, session preserved ═══');
console.log(`  rows in: ${qA.rowsIn}   mapped: ${qA.mapped} (${(qA.mappedPct * 100).toFixed(1)}%)`);
console.log(`  events by action:`, qA.eventsByAction);
console.log(`  sessions: canonical ${new Set(canonical.map(e => e.sessionId)).size} -> adapted ${qA.sessions}`);
console.log(`  warnings: ${qA.warnings.length ? qA.warnings.join(' | ') : 'none'}`);
console.log(`  FIELD-BY-FIELD ROUND-TRIP: ${exactA ? '✅ EXACT MATCH on all ' + keysCanon.length + ' events (ts compared at second granularity — the source format floors ms)' : '❌ MISMATCH'}`);
if (!exactA) { const d = firstDiff(keysA, keysCanon); console.log('    first diff at', d.i, '\n     adapted:  ', d.got, '\n     canonical:', d.want); }

/* ---- CASE B: realistic lossy — no session column, plus junk rows ---- */
const stripped = canonical.map(e => ({ ts: e.ts, userId: e.userId, action: e.action, stake: e.stake, payout: e.payout, amount: e.amount }));
const junk = [
  { ts: canonical[10].ts + 5, userId: 'real-1', action: 'click', stake: undefined },      // unrecognised action
  { ts: canonical[11].ts + 5, userId: 'real-1', action: 'view_advert', stake: undefined }, // unrecognised action
  { ts: 'not-a-timestamp', userId: 'real-1', action: 'bet', stake: 5 },                    // bad timestamp
  { ts: Math.floor(canonical[12].ts / 1000), userId: 'real-2', action: '', stake: undefined }, // blank action
];
const lossy = stripped.concat(junk).sort((a, b) => (typeof a.ts === 'number' ? a.ts : 0) - (typeof b.ts === 'number' ? b.ts : 0));
const resB = fromJSON(lossy, { columnMap: { ts: 'ts', userId: 'userId', action: 'action', stake: 'stake', payout: 'payout', amount: 'amount' } });
const qB = qualityReport(resB);
const keysB = keysOf(resB.events);
const exactB = keysB.length === keysCanonExact.length && keysB.every((k, i) => k === keysCanonExact[i]);

console.log('\n═══ CASE B — realistic lossy: no session id, junk rows present ═══');
console.log(`  rows in: ${qB.rowsIn}  ->  mapped: ${qB.mapped}   dropped: ${qB.rowsIn - qB.mapped}`);
console.log(`  unmapped actions:`, qB.unmappedActions);
console.log(`  rejected:`, qB.rejected);
console.log(`  session ids DERIVED from time gaps: ${qB.sessions} sessions`);
console.log(`  warnings: ${qB.warnings.join(' | ')}`);
console.log(`  ROUND-TRIP (surviving rows): ${exactB ? '✅ EXACT MATCH on all ' + keysCanonExact.length + ' canonical events (full ms)' : '❌ MISMATCH'}`);
if (!exactB) { const d = firstDiff(keysB, keysCanonExact); console.log('    first diff at', d.i, '\n     adapted:  ', d.got, '\n     canonical:', d.want); }

/* ---- downstream: does the engine run on adapted data? ---- */
const adaptedUser = [...new Set(resB.events.map(e => e.userId))][0];
const stats = analyzeUser(resB.events, adaptedUser);
const score = hookScore(stats);
console.log('\n═══ downstream on adapted data ═══');
console.log(`  analyzeUser(${adaptedUser}): bets=${stats.totalBets}, sessions=${stats.sessions}, RTP=${stats.actualRTP}%`);
console.log(`  Hook Score = ${score}`);
console.log(`  value preservation check — canonical totalStaked vs adapted:`);
const canonUser = canonical.filter(e => e.userId === adaptedUser);
const canonStake = canonUser.filter(e => e.action === 'bet').reduce((a, b) => a + (b.stake || 0), 0);
console.log(`    canonical ${canonStake.toFixed(2)}  vs  adapted ${stats.totalStaked.toFixed(2)}  ->  ${Math.abs(canonStake - stats.totalStaked) < 0.01 ? '✅ identical' : '❌ differs'}`);

fs.writeFileSync(path.join(OUT, 'adapter_results.json'), JSON.stringify({
  canonicalEvents: canonical.length,
  caseA: { rowsIn: qA.rowsIn, mapped: qA.mapped, exactRoundTrip: exactA, warnings: qA.warnings },
  caseB: { rowsIn: qB.rowsIn, mapped: qB.mapped, dropped: qB.rowsIn - qB.mapped, unmapped: qB.unmappedActions, rejected: qB.rejected, exactRoundTrip: exactB, warnings: qB.warnings },
  downstream: { user: adaptedUser, hookScore: score, canonicalStake: canonStake, adaptedStake: stats.totalStaked },
}, null, 2));
console.log('\nWrote output/adapter_results.json');
