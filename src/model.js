/**
 * model.js — the "Algorithm Mirror" engine.
 *
 * DELIBERATE DESIGN CHOICE: interpretable Markov chain + transparent
 * behavioral metrics instead of a black-box neural net.
 * The product's purpose is EXPLANATION — every prediction must come with
 * a human-readable reason a harmed user can verify against their own history.
 */

const ACTIONS = ['login', 'deposit', 'bet', 'win', 'loss', 'near_miss', 'withdraw', 'logout'];

/** Build a first-order Markov transition model, optionally conditioned on context. */
function trainMarkov(events, contextFn = null) {
  const counts = {}; // context -> prevAction -> nextAction -> n
  for (let i = 0; i < events.length - 1; i++) {
    const cur = events[i], nxt = events[i + 1];
    if (cur.userId !== nxt.userId) continue; // don't cross user boundaries
    const ctx = contextFn ? contextFn(cur, events, i) : 'global';
    counts[ctx] ??= {};
    counts[ctx][cur.action] ??= {};
    counts[ctx][cur.action][nxt.action] = (counts[ctx][cur.action][nxt.action] || 0) + 1;
  }
  return counts;
}

/** Predict next action distribution given model + context. Includes top-3 with probabilities. */
function predictNext(model, ctx, currentAction) {
  const row = model[ctx]?.[currentAction];
  if (!row) return { ctx, currentAction, predictions: [], total: 0 };
  const total = Object.values(row).reduce((a, b) => a + b, 0);
  const predictions = Object.entries(row)
    .map(([action, n]) => ({ action, p: n / total, n }))
    .sort((a, b) => b.p - a.p)
    .slice(0, 3);
  return { ctx, currentAction, predictions, total };
}

/* ---------------- Truth-exposing behavioral metrics ---------------- */

function analyzeUser(events, userId) {
  const ev = events.filter(e => e.userId === userId).sort((a, b) => a.ts - b.ts);
  const bets = ev.filter(e => e.action === 'bet');
  const bySession = Object.create(null);
  for (const e of ev) (bySession[e.sessionId] ??= []).push(e);

  // 1. Loss-chase ratio: P(bet within 30s | loss) vs P(bet within 30s | win)
  let reBetAfterLoss = 0, losses = 0, reBetAfterWin = 0, wins = 0;
  // 2. Stake escalation: correlation between consecutive losses and stake size
  const stakeSequences = [];
  // 3. Near-miss continuation: P(continue session | near_miss) vs P(continue | loss)
  let contAfterNM = 0, nmCount = 0, contAfterLoss = 0, lossCount = 0;
  // 4. Session acceleration: median bet gap in first third vs last third
  const accelerations = [];
  // 5. Night play share (22:00–06:00)
  let nightBets = 0;

  for (const sess of Object.values(bySession)) {
    const sessBets = sess.filter(e => e.action === 'bet');
    let consec = 0;
    for (let i = 0; i < sess.length; i++) {
      const e = sess[i], nxt = sess[i + 1];
      if (e.action === 'bet') {
        stakeSequences.push({ consec, stake: e.stake });
        if (e.hour >= 22 || e.hour < 6) nightBets++;
      }
      if (e.action === 'loss') {
        consec++; losses++; lossCount++;
        if (nxt?.action === 'bet' && nxt.ts - e.ts >= 0 && nxt.ts - e.ts <= 30000) reBetAfterLoss++;
        if (nxt && nxt.action !== 'logout') contAfterLoss++;
      }
      if (e.action === 'win') {
        consec = 0; wins++;
        if (nxt?.action === 'bet' && nxt.ts - e.ts >= 0 && nxt.ts - e.ts <= 30000) reBetAfterWin++;
      }
      if (e.action === 'near_miss') {
        consec++; nmCount++;
        if (nxt && nxt.action !== 'logout') contAfterNM++;
      }
    }
    // acceleration within session
    if (sessBets.length >= 6) {
      const gaps = sessBets.slice(1).map((b, i) => (b.ts - sessBets[i].ts) / 1000);
      const third = Math.floor(gaps.length / 3);
      const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
      if (third > 0) accelerations.push(med(gaps.slice(0, third)) / Math.max(1, med(gaps.slice(-third))));
    }
  }

  // stake escalation slope: avg stake at 0,1,2,3+ consecutive losses
  const stakeByConsec = {};
  for (const s of stakeSequences) {
    if (!Number.isFinite(s.stake)) continue;
    const k = Math.min(s.consec, 3);
    (stakeByConsec[k] ??= []).push(s.stake);
  }
  const avgStakeByConsec = Object.fromEntries(
    Object.entries(stakeByConsec).map(([k, v]) => [k, v.reduce((a, b) => a + b, 0) / v.length])
  );

  const sessionLengths = Object.values(bySession).map(s => (s.at(-1).ts - s[0].ts) / 60000);
  const totalStaked = bets.reduce((a, b) => a + (b.stake || 0), 0);
  const totalWon = ev.filter(e => e.action === 'win').reduce((a, b) => a + (b.payout || 0), 0);

  return {
    userId,
    sessions: Object.keys(bySession).length,
    totalBets: bets.length,
    totalStaked: Math.round(totalStaked * 100) / 100,
    totalReturned: Math.round(totalWon * 100) / 100,
    actualRTP: totalStaked > 0 ? Math.round((totalWon / totalStaked) * 1000) / 10 : null,
    losses, wins, reBetAfterLoss, reBetAfterWin,
    lossChase: {
      pReBetAfterLoss30s: losses ? reBetAfterLoss / losses : 0,
      pReBetAfterWin30s: wins ? reBetAfterWin / wins : 0,
    },
    nearMissContinuation: {
      pContinueAfterNearMiss: nmCount ? contAfterNM / nmCount : 0,
      pContinueAfterLoss: lossCount ? contAfterLoss / lossCount : 0,
    },
    avgStakeByConsecutiveLosses: avgStakeByConsec,
    sessionAccelerationRatio: accelerations.length
      ? accelerations.reduce((a, b) => a + b, 0) / accelerations.length : 1,
    nightBetShare: bets.length ? nightBets / bets.length : 0,
    avgSessionMinutes: sessionLengths.length
      ? sessionLengths.reduce((a, b) => a + b, 0) / sessionLengths.length : 0,
  };
}

/** Composite "hook score" 0–100: experimental descriptive index; not a validated measure of addiction. */
function hookScore(m) {
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const chaseGap = clamp01(m.lossChase.pReBetAfterLoss30s - m.lossChase.pReBetAfterWin30s);
  const esc = m.avgStakeByConsecutiveLosses;
  const escalation = esc[0] > 0 ? clamp01(((esc[3] || esc[2] || esc[0]) / esc[0] - 1) / 3) : 0;
  const accel = clamp01((m.sessionAccelerationRatio - 1) / 4);
  const night = clamp01(m.nightBetShare / 0.6);
  const nm = clamp01((m.nearMissContinuation.pContinueAfterNearMiss - 0.7) / 0.3);
  const score = 100 * (0.30 * chaseGap + 0.25 * escalation + 0.20 * accel + 0.15 * night + 0.10 * nm);
  return Math.round(score);
}

module.exports = { trainMarkov, predictNext, analyzeUser, hookScore, ACTIONS };
