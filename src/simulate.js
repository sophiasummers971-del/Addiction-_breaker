/**
 * simulate.js
 * Simulates realistic gambling-site user event logs.
 * Behavior patterns modeled on documented gambling-psychology research:
 *  - Loss-chasing: elevated re-bet probability & stake escalation after losses
 *  - Near-miss effect: near-misses increase continuation propensity
 *  - Session deepening: bet speed accelerates as session length grows
 *  - Night-time vulnerability: late-night sessions are longer & riskier
 * Two user archetypes: 'casual' and 'addicted-pattern'.
 */

const ACTIONS = ['login', 'deposit', 'bet', 'win', 'loss', 'near_miss', 'withdraw', 'logout'];

function rand(seedObj) {
  // deterministic LCG so results are reproducible
  seedObj.s = (seedObj.s * 1664525 + 1013904223) % 4294967296;
  return seedObj.s / 4294967296;
}

function pickWeighted(weights, r) {
  let acc = 0;
  for (const [k, w] of Object.entries(weights)) {
    acc += w;
    if (r <= acc) return k;
  }
  return Object.keys(weights).at(-1);
}

/**
 * Generate a synthetic event log for one user over `days` days.
 * Each event: { ts, userId, action, stake?, outcome?, hour, sessionId, gapSec }
 */
function generateUserLog(userId, archetype, days, seed, opts = {}) {
  // STREAK PERSISTENCE: a tunable 2nd-order dependency in [0,1]. When >0, a
  // loss genuinely raises the probability that the NEXT outcome is also a loss,
  // by scaling the non-loss mass down (smooth and NON-saturating across the
  // whole range). Default 0 reproduces the memoryless (i.i.d.) behaviour exactly.
  const streakPersistence = opts.streakPersistence ?? 0;
  const s = { s: seed };
  const events = [];
  let clock = Date.UTC(2026, 8, 1, 0, 0, 0); // 2026-09-01 baseline
  const dayMs = 86400000;
  let sessionCounter = 0;

  for (let d = 0; d < days; d++) {
    const dayStart = clock + d * dayMs;
    // FINANCIAL-PRESSURE ENTRY: play is triggered by the pressure cycle, not
    // curiosity. Addicted-pattern users are far more likely to play in the
    // payday window (days 1-3, when pressure peaks and money briefly exists)
    // and in the days just before payday (days 27-31, when the cupboard is bare).
    const dom = new Date(dayStart).getUTCDate();
    const pressureDay = dom <= 3 || dom >= 28;
    let sessionsToday;
    if (archetype === 'addicted-pattern') {
      if (pressureDay) {
        sessionsToday = rand(s) < 0.75 ? 2 : 1;        // pressure spike: heavy play
      } else {
        sessionsToday = rand(s) < 0.30 ? 1 : 0;        // off-pressure: often absent
      }
    } else {
      sessionsToday = rand(s) < 0.25 ? 1 : (rand(s) < 0.5 ? 1 : 0);
    }

    for (let sess = 0; sess < sessionsToday; sess++) {
      // Financial-pressure entry: addicted-pattern users' sessions cluster around
      // payday (days 1-3 of month) — play is triggered by pressure + brief liquidity,
      // not curiosity. Casual users spread evenly.
      sessionCounter++;
      const sessionId = `${userId}-S${sessionCounter}`;
      // addicted-pattern users disproportionately start sessions 22:00–03:00
      let hour;
      if (archetype === 'addicted-pattern' && rand(s) < 0.55) {
        hour = rand(s) < 0.6 ? 22 + Math.floor(rand(s) * 5) % 24 : Math.floor(rand(s) * 24);
        hour = hour % 24;
      } else {
        hour = 10 + Math.floor(rand(s) * 10);
      }
      let t = dayStart + hour * 3600000 + Math.floor(rand(s) * 1800000);
      const paydayPressure = pressureDay;
      let lastTs = null;
      let consecutiveLosses = 0;
      let lastOutcome = null; // previous outcome action, for streak persistence
      let betsThisSession = 0;
      const maxBets = archetype === 'addicted-pattern'
        ? 15 + Math.floor(rand(s) * 45)   // long sessions
        : 3 + Math.floor(rand(s) * 10);   // short sessions

      const push = (action, extra = {}) => {
        events.push({
          ts: t, userId, action, hour: new Date(t).getUTCHours(),
          sessionId,
          gapSec: lastTs === null ? null : Math.round((t - lastTs) / 1000),
          ...extra,
        });
        lastTs = t;
      };

      push('login');
      // payday pressure: bigger, faster deposits when the paycheck just landed
      const depP = paydayPressure && archetype === 'addicted-pattern' ? 0.98 : 0.85;
      if (rand(s) < depP) {
        t += (paydayPressure ? 10000 : 30000) + rand(s) * 90000;
        const amount = paydayPressure && archetype === 'addicted-pattern'
          ? 40 + Math.floor(rand(s) * 160)   // a dangerous share of the paycheck
          : 10 + Math.floor(rand(s) * 90);
        push('deposit', { amount, paydayPressure });
      }

      while (betsThisSession < maxBets) {
        // gap between bets shrinks as session deepens (acceleration)
        const baseGap = archetype === 'addicted-pattern'
          ? Math.max(8000, 60000 - betsThisSession * 1200)
          : Math.max(15000, 90000 - betsThisSession * 1000);
        // after a loss, re-bet comes much faster for addicted-pattern
        const lossBoost = (consecutiveLosses > 0 && archetype === 'addicted-pattern') ? 0.35 : 1;
        t += baseGap * lossBoost * (0.5 + rand(s));

        // stake escalation after losses
        const baseStake = 2 + rand(s) * 8;
        const stake = Math.round(baseStake * Math.pow(1.35, consecutiveLosses) * 100) / 100;
        push('bet', { stake });
        betsThisSession++;

        const roll = rand(s);
        const nearMissP = 0.12;
        const baseWinP = 0.18; // house edge baked in
        const baseLossP = 1 - baseWinP - nearMissP; // 0.70 = memoryless loss probability
        // STREAK PERSISTENCE (2nd-order dependency): after a loss, raise the loss
        // probability toward 1 by `streakPersistence`; split the remaining non-loss
        // mass between win and near-miss in their original ratio. This keeps the
        // knob smooth and non-saturating over [0,1] (the old form clamped at 0.02,
        // which made every value >= 0.2 behave identically).
        const lossP = lastOutcome === 'loss'
          ? baseLossP + (1 - baseLossP) * streakPersistence
          : baseLossP;
        const scale = (1 - lossP) / (1 - baseLossP); // 1 at p=0 -> 0 at p=1
        const winP = baseWinP * scale;
        const nmP = nearMissP * scale;
        t += 3000 + rand(s) * 5000;
        if (roll < winP) {
          push('win', { payout: Math.round(stake * (1.2 + rand(s) * 3) * 100) / 100 });
          consecutiveLosses = 0;
          lastOutcome = 'win';
        } else if (roll < winP + nmP) {
          push('near_miss');
          consecutiveLosses++; // near-misses function like losses neurologically
          lastOutcome = 'near_miss';
        } else {
          push('loss');
          consecutiveLosses++;
          lastOutcome = 'loss';
        }

        // quit probability: casual users quit readily; addicted-pattern persist after losses
        let quitP = archetype === 'addicted-pattern' ? 0.04 : 0.18;
        if (consecutiveLosses >= 3) {
          quitP = archetype === 'addicted-pattern' ? 0.02 : 0.35; // loss-chasing vs. walking away
        }
        if (rand(s) < quitP) break;
      }

      // occasional withdraw for casual users only
      if (archetype === 'casual' && rand(s) < 0.3) { t += 20000; push('withdraw', { amount: 5 + Math.floor(rand(s) * 40) }); }
      t += 15000 + rand(s) * 30000;
      push('logout');
    }
  }
  return events.sort((a, b) => a.ts - b.ts);
}

module.exports = { generateUserLog, ACTIONS };
