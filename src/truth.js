/**
 * truth.js — the psychological core of the Algorithm Mirror.
 *
 * This module exists because addiction does not start with curiosity.
 * It starts with financial pressure and the feeling of no way out.
 * The platform's deepest hook is the engineered belief:
 *     "I lost X. I have to get that money back."
 * This module dismantles that belief with the user's OWN numbers.
 * No sugar-coating. No "play responsibly" stickers. Arithmetic.
 */

/**
 * The Recovery Math — the single most important honest calculation.
 *
 * Given the RTP the user ACTUALLY experienced (not the advertised one),
 * and their net loss L:
 *  - Every additional dollar wagered returns, on average, r dollars.
 *  - So every dollar chased costs (1 - r) dollars in expectation.
 *  - There is no amount of play that statistically recovers L.
 *    Expected recovery via continued play is NEGATIVE forever.
 */
function recoveryMath(profile) {
  const L = Math.max(0, profile.totalStaked - profile.totalReturned); // net loss ($)
  const r = (profile.actualRTP ?? 85) / 100;                          // experienced RTP
  const lossPerDollar = 1 - r;

  // "To win back L, I just need one good session."
  // Expected additional loss per $1,000 wagered while chasing:
  const costPer1000Chased = 1000 * lossPerDollar;

  // How deep does the hole get if they chase with another L?
  // Wager L more → expected to lose L * (1 - r) more → hole deepens.
  const holeAfterChasingSameAgain = L + L * lossPerDollar;

  // The gambler's fantasy: "wager W, win it back." For the expected
  // net position to return to zero, you'd need positive EV — which
  // this game structurally never offers. We show the required luck:
  // probability that a single even-money-style bet sequence recovers L
  // before doubling the hole is always < 50% and shrinks as L grows.
  // Simple gambler's-ruin framing: chasing L with unit bets of avg stake,
  // p(win single bet) ≈ r-adjusted ~0.18 jackpot logic — we keep it simple:
  const avgStake = profile.totalBets > 0 ? profile.totalStaked / profile.totalBets : 0;
  const betsToDoubleHole = lossPerDollar > 0 && avgStake > 0
    ? Math.round(L / (avgStake * lossPerDollar))
    : null;

  return {
    netLoss: Math.round(L * 100) / 100,
    experiencedRTP: profile.actualRTP,
    lossPerDollarChased: Math.round(lossPerDollar * 1000) / 1000,
    costPer1000Chased: Math.round(costPer1000Chased * 100) / 100,
    holeAfterChasingSameAgain: Math.round(holeAfterChasingSameAgain * 100) / 100,
    betsToDoubleHole,
  };
}

/**
 * Financial-pressure timeline — when did the play happen relative to
 * pressure events (paydays, big losses)? The chase calendar.
 */
function pressureTimeline(events, userId) {
  const ev = events.filter(e => e.userId === userId).sort((a, b) => a.ts - b.ts);
  const deposits = ev.filter(e => e.action === 'deposit');
  // day-of-month distribution of deposits: clustering near day 1 (payday) is the tell
  const byDayOfMonth = {};
  for (const d of deposits) {
    const dom = new Date(d.ts).getUTCDate();
    byDayOfMonth[dom] = (byDayOfMonth[dom] || 0) + 1;
  }
  // pressure window: payday (days 1-3) AND the bare-cupboard days before it (28-31)
  const paydayWindow = Object.entries(byDayOfMonth)
    .filter(([d]) => +d <= 3 || +d >= 28)
    .reduce((a, [, n]) => a + n, 0);
  return {
    deposits: deposits.length,
    depositByDayOfMonth: byDayOfMonth,
    paydayDepositShare: deposits.length ? paydayWindow / deposits.length : 0,
  };
}

/**
 * THE MIRROR TEXT — brutally honest, first-person-confronting narrative
 * generated entirely from the user's own recorded behavior.
 * Written to crack the "get it back" layer, not to shame the person.
 */
function mirrorNarrative(profile, rm, pt) {
  const lines = [];
  const fmt = n => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  lines.push(`THE MIRROR — ${profile.userId}`);
  lines.push('');
  lines.push(`You put in ${fmt(profile.totalStaked)}. You got back ${fmt(profile.totalReturned)}.`);
  if (rm.netLoss > 0) {
    lines.push(`The difference — ${fmt(rm.netLoss)} — is not "money you're down."`);
    lines.push(`It is money the game took. That is what it is built to do.`);
  } else {
    lines.push(`You are ahead right now. Read that again: RIGHT NOW.`);
    lines.push(`The game returned >100% to you by variance, not by design. Its structure`);
    lines.push(`guarantees the return drifts below 100% the longer you play. Your current win`);
    lines.push(`is not proof the system can be beaten — it is bait the math has not reclaimed yet.`);
  }
  lines.push('');
  lines.push(`WHY YOU STARTED`);
  if (pt.paydayDepositShare > 0.3) {
    lines.push(`${Math.round(pt.paydayDepositShare * 100)}% of your deposits landed in the pressure window — the 3 days after payday, or the broke days right before it.`);
    lines.push(`That is not a coincidence and it is not a character flaw. It is a schedule.`);
    lines.push(`The platform times its prompts to the exact moment pressure peaks and money briefly exists —`);
    lines.push(`or has just run out. You were not playing a game. You were being sold a way out,`);
    lines.push(`at the price of the way out itself.`);
  } else {
    lines.push(`Your play was spread across the month — the pressure pattern here is chronic, not cyclical.`);
  }
  lines.push('');
  lines.push(`THE "GET IT BACK" TRAP — IN ARITHMETIC`);
  if (rm.netLoss > 0) {
    lines.push(`The game returned ${rm.experiencedRTP}% of what you fed it — not the advertised number, YOUR number.`);
    lines.push(`That means every $1,000 you wager trying to recover your ${fmt(rm.netLoss)} costs you ~${fmt(rm.costPer1000Chased)} more.`);
    lines.push(`Chase it with the same amount again and the hole does not close — it grows to ~${fmt(rm.holeAfterChasingSameAgain)}.`);
    if (rm.betsToDoubleHole) {
      lines.push(`At your average stake, roughly ${rm.betsToDoubleHole} more bets doubles the hole. The math has one direction.`);
    }
  } else {
    lines.push(`There is nothing to "get back" — which is exactly when the trap resets.`);
    lines.push(`The house edge has not changed. Keep feeding it and your cushion is the next hole's seed money.`);
  }
  lines.push(`The feeling that you are "due" is not a premonition. It is a feature, engineered and A/B-tested.`);
  lines.push('');
  lines.push(`WHAT THE MACHINE LEARNED ABOUT YOU`);
  const chasePct = Math.round(profile.lossChase.pReBetAfterLoss30s * 100);
  lines.push(`After a loss, you re-bet within 30 seconds ${chasePct}% of the time. After a win: ${Math.round(profile.lossChase.pReBetAfterWin30s * 100)}%.`);
  lines.push(`That gap is not your personality. It is the design working. Losses are engineered to feel like near-escapes,`);
  lines.push(`and the next bet is placed before your thinking mind comes back online.`);
  const esc = profile.avgStakeByConsecutiveLosses;
  if (esc['0'] && esc['1']) {
    lines.push(`Your average stake grew from ${fmt(esc['0'])} to ${fmt(esc['1'])} after a single loss.`);
    lines.push(`The platform watches that reflex in real time and prices it in.`);
  }
  const nightPct = Math.round(profile.nightBetShare * 100);
  if (nightPct > 20) {
    lines.push(`${nightPct}% of your bets happened between 22:00 and 06:00 — the hours when judgment is lowest and limits are quietest.`);
  }
  lines.push('');
  lines.push(`THE ONLY MOVE THE MATH CANNOT BEAT`);
  if (rm.netLoss > 0) {
    lines.push(`The ${fmt(rm.netLoss)} is gone. Not "temporarily down." Gone.`);
    lines.push(`Every exit other than stopping has a negative price tag attached to it.`);
    lines.push(`Stopping is not giving up the recovery. Stopping IS the recovery.`);
  } else {
    lines.push(`You are holding winnings the game is structurally designed to take back.`);
    lines.push(`Every further spin has a negative price tag attached to it.`);
    lines.push(`Walking away ahead is the one outcome the house cannot recover from. Take it.`);
  }
  lines.push('');
  lines.push(`If this is money you needed: that is a debt problem now, and debt problems have`);
  lines.push(`real solutions (counseling, restructuring, support lines) — none of which spin.`);

  return lines.join('\n');
}

module.exports = { recoveryMath, pressureTimeline, mirrorNarrative };
