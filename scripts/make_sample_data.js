/**
 * Writes the committed fixtures.
 *   data/sample_export.csv   -> 3 addicted-pattern users (epoch SECONDS, aliased actions)
 *   data/sample_export.json  -> 2 casual users (ISO timestamps, canonical actions)
 * The two formats carry DIFFERENT users on purpose, so ingesting all of data/
 * merges into one clean 5-user stream instead of double-counting one cohort.
 * test/fixtures/sample_export_dirty.csv holds the deliberately broken rows.
 *
 * Stake and payout ARE separate columns — a single `amount` column cannot carry
 * both a wager and a return, so RTP is uncomputable from it.
 */
const fs = require('fs');
const path = require('path');
const { generateUserLog } = require('../src/simulate');

const DATA = path.join(__dirname, '..', 'data');
const FIX = path.join(__dirname, '..', 'test', 'fixtures');
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(FIX, { recursive: true });

const ALIAS = { login: 'signin', deposit: 'topup', bet: 'spin', win: 'cashout', loss: 'lose', near_miss: 'almost', withdraw: 'redeem', logout: 'signout' };
const money = e => (e.stake != null ? e.stake : (e.payout != null ? e.payout : (e.amount != null ? e.amount : '')));

let pattern = [];
['s1', 's2', 's3'].forEach((u, i) => { pattern = pattern.concat(generateUserLog(u, 'addicted-pattern', 18, 4242 + i * 77)); });
pattern.sort((a, b) => a.ts - b.ts);
let casual = [];
['c1', 'c2'].forEach((u, i) => { casual = casual.concat(generateUserLog(u, 'casual', 18, 555 + i * 31)); });
casual.sort((a, b) => a.ts - b.ts);

const csv = ['event_time,player_id,event_type,stake,payout,session_id'];
pattern.forEach(e => csv.push([
  Math.floor(e.ts / 1000), e.userId, ALIAS[e.action],
  e.action === 'bet' ? e.stake : (e.stake != null ? e.stake : ''),
  (e.action === 'win' || e.action === 'near_miss' || e.action === 'loss') ? (e.payout != null ? e.payout : '') : '',
  e.sessionId].join(',')));
fs.writeFileSync(path.join(DATA, 'sample_export.csv'), csv.join('\n') + '\n');

const json = casual.map(e => ({
  timestamp: new Date(e.ts).toISOString(), user_id: e.userId, action: e.action,
  stake: e.action === 'bet' ? (e.stake != null ? e.stake : null) : (e.stake != null ? e.stake : null),
  payout: (e.action === 'win' || e.action === 'near_miss' || e.action === 'loss') ? (e.payout != null ? e.payout : null) : null,
  session_id: e.sessionId,
}));
fs.writeFileSync(path.join(DATA, 'sample_export.json'), JSON.stringify(json, null, 2) + '\n');

const dirty = ['event_time,player_id,event_type,stake,payout,session_id'];
pattern.slice(0, 30).forEach(e => dirty.push([Math.floor(e.ts / 1000), e.userId, ALIAS[e.action], money(e), '', e.sessionId].join(',')));
dirty.push('not-a-timestamp,s1,spin,5,,s-99');
dirty.push(`${Math.floor(pattern[10].ts / 1000)},s1,bonus_hunt,5,,s-99`);
dirty.push(`${Math.floor(pattern[11].ts / 1000)},s1,,5,,s-99`);
fs.writeFileSync(path.join(FIX, 'sample_export_dirty.csv'), dirty.join('\n') + '\n');

console.log(`data/sample_export.csv  : ${pattern.length} rows, 3 users (addicted-pattern, epoch-seconds, aliased actions)`);
console.log(`data/sample_export.json : ${casual.length} rows, 2 users (casual, ISO-8601, canonical actions)`);
console.log(`test/fixtures/sample_export_dirty.csv : 30 good rows + 3 unusable rows`);
