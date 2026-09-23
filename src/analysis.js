'use strict';
const {parseCSV, detectColumns, assertSchema, fromJSON, qualityReport} = require('./adapters');
const {analyzeUser, hookScore} = require('./model');
const {recoveryMath, pressureTimeline, mirrorNarrative} = require('./truth');
const MAX_ROWS = 20000;
function analyzeText(text, name) {
  let rows;
  if (/\.json$/i.test(name)) {
    let parsed; try {parsed = JSON.parse(text.replace(/^\uFEFF/,''));} catch {throw new Error('This file is not valid JSON.');}
    rows = Array.isArray(parsed) ? parsed : ['events','data','rows','records','logs'].map(k=>parsed?.[k]).find(Array.isArray);
  } else if (/\.(csv|tsv|txt)$/i.test(name)) rows = parseCSV(text, /\.tsv$/i.test(name) ? '\t' : ',');
  else throw new Error('Choose a CSV, TSV, TXT (comma-separated), or JSON event export.');
  if (!Array.isArray(rows) || !rows.length) throw new Error('No records found. Provide an array of events or a headered CSV.');
  if (rows.length > MAX_ROWS) throw new Error(`Use at most ${MAX_ROWS} rows per file.`);
  if (rows.some(r=>!r || typeof r !== 'object' || Array.isArray(r))) throw new Error('Every record must be an object.');
  const columns = detectColumns(rows); assertSchema(columns, rows, 'upload');
  const result = fromJSON(rows, {columnMap:columns});
  if (!result.events.length) throw new Error('No usable events. Check timestamps and action names.');
  if (new Set(result.events.map(e=>e.userId)).size > 100) throw new Error('Use at most 100 people per file.');
  // Do not silently convert malformed money to zero or infer monetary totals from partial rows.
  for (const e of result.events) {
    const field = e.action === 'bet' ? 'stake' : e.action === 'win' ? 'payout' : ['deposit','withdraw'].includes(e.action) ? 'amount' : null;
    if (!field) continue;
    const raw = columns[field] ? e._sourceRow[columns[field]] : null;
    if (raw != null && String(raw).trim() !== '' && (!Number.isFinite(e[field]) || e[field] < 0 || e[field] > 1e9)) throw new Error(`Invalid ${field} amount. Use non-negative decimal amounts up to 1 billion; do not mix currencies.`);
  }
  const symbols = new Set();
  for (const row of rows) for (const key of [columns.stake,columns.payout,columns.amount]) {const symbol=String(row[key]??'').trim().match(/^[£$€]/)?.[0];if(symbol)symbols.add(symbol);}
  const currencyKey=Object.keys(rows[0]).find(k=>['currency','currency_code'].includes(k.toLowerCase()));
  const currencyCodes=new Set(rows.map(r=>String(r[currencyKey]??'').trim().toUpperCase()).filter(Boolean));
  if(symbols.size>1 || currencyCodes.size>1) throw new Error('Mixed currencies found. Analyze each currency separately.');
  const quality = qualityReport(result);
  const warnings = [...quality.warnings];
  if (result.issues.length) warnings.push('Some rows were omitted. All results describe the accepted subset only.');
  const users = [...new Set(result.events.map(e=>e.userId))].map(user=>{
    const events = result.events.filter(e=>e.userId === user);
    const stats = analyzeUser(events,user);
    const bets = events.filter(e=>e.action === 'bet');
    const wins = events.filter(e=>e.action === 'win');
    const stakesKnown = !!columns.stake && bets.length > 0 && bets.every(e=>Number.isFinite(e.stake));
    const outcomeCount = events.filter(e=>['win','loss','near_miss'].includes(e.action)).length;
    const returnsKnown = !!columns.payout && bets.length > 0 && outcomeCount >= bets.length && wins.every(e=>Number.isFinite(e.payout));
    if (!stakesKnown || !returnsKnown) warnings.push(`${user}: missing monetary fields or outcome coverage; net result and historical return are unavailable.`);
    const profile = {...stats,totalStaked:stakesKnown ? stats.totalStaked : null,totalReturned:returnsKnown ? stats.totalReturned : null,
      actualRTP:stakesKnown && returnsKnown ? stats.actualRTP : null};
    const pt = pressureTimeline(events,user);
    return {user,events:events.length,sessions:stats.sessions,bets:bets.length,staked:profile.totalStaked,returned:profile.totalReturned,
      netLoss:stakesKnown && returnsKnown ? Math.round((stats.totalStaked-stats.totalReturned)*100)/100 : null,rtp:profile.actualRTP,
      hook:stakesKnown && stats.losses && stats.wins ? hookScore(stats) : null,
      losses:stats.losses,wins:stats.wins,reBetAfterLoss:stats.reBetAfterLoss,reBetAfterWin:stats.reBetAfterWin,
      pReBetAfterLoss30s:stats.losses ? stats.lossChase.pReBetAfterLoss30s : null,
      pReBetAfterWin30s:stats.wins ? stats.lossChase.pReBetAfterWin30s : null,
      nightShare:bets.length ? stats.nightBetShare : null,pressureShare:pt.paydayDepositShare,
      narrative:mirrorNarrative(profile,recoveryMath(profile),pt)};
  });
  return {totals:{rowsIn:rows.length,events:result.events.length,users:users.length,dropped:result.issues.length},columns,warnings,
    issues:result.issues.slice(0,20).map(i=>({row:i.index+1,reason:i.reason})),users};
}
module.exports = {analyzeText};
