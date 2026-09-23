'use strict';
/** Recorded losses and optional, explicitly assumed long-run RTP scenarios. */
function recoveryMath(profile, assumedRTP = null) {
  const known = Number.isFinite(profile.totalStaked) && Number.isFinite(profile.totalReturned);
  const netLoss = known ? Math.max(0, profile.totalStaked - profile.totalReturned) : null;
  if (assumedRTP !== null && (!Number.isFinite(assumedRTP) || assumedRTP < 0 || assumedRTP > 100)) throw new Error('Assumed RTP must be between 0 and 100');
  const gap = assumedRTP === null ? null : 1 - assumedRTP / 100;
  const round = n => Math.round(n * 100) / 100;
  return { netLoss: netLoss === null ? null : round(netLoss), experiencedRTP: profile.actualRTP ?? null,
    assumedRTP, lossPerDollarChased: gap, costPer1000Chased: gap === null ? null : round(1000 * gap),
    holeAfterChasingSameAgain: gap === null || netLoss === null ? null : round(netLoss * (1 + gap)),
    betsToDoubleHole: null };
}
function pressureTimeline(events, userId) {
  const deposits = events.filter(e => e.userId === userId && e.action === 'deposit');
  const byDayOfMonth = {};
  for (const d of deposits) { const day = new Date(d.ts).getUTCDate(); byDayOfMonth[day] = (byDayOfMonth[day] || 0) + 1; }
  const count = deposits.filter(d => { const day = new Date(d.ts).getUTCDate(); return day <= 3 || day >= 28; }).length;
  return { deposits: deposits.length, depositByDayOfMonth: byDayOfMonth, paydayDepositShare: deposits.length ? count / deposits.length : null,
    window: 'UTC calendar days 1–3 and 28–31; actual payday is unknown' };
}
function mirrorNarrative(profile, rm, pt) {
  const amount = n => Number(n).toLocaleString('en-GB', {maximumFractionDigits:2});
  const lines = [`YOUR RECORDED HISTORY — ${profile.userId}`];
  if (Number.isFinite(profile.totalStaked) && Number.isFinite(profile.totalReturned)) {
    lines.push(`Recorded stakes: ${amount(profile.totalStaked)}. Recorded returns: ${amount(profile.totalReturned)}. Amounts use the export's currency.`);
    const diff = profile.totalStaked - profile.totalReturned;
    lines.push(diff > 0 ? `The recorded difference is a loss of ${amount(diff)}. Further gambling does not erase that history.` : `The recorded difference is ${amount(-diff)} ahead. This does not establish that future play will be profitable.`);
  } else lines.push('Some monetary data is missing. Net loss and historical return cannot be established from this export.');
  if (profile.losses) lines.push(`${profile.reBetAfterLoss} of ${profile.losses} recorded losses were immediately followed by a bet within 30 seconds in the same session.`);
  else lines.push('No recorded loss outcomes: loss-chasing frequency is unknown.');
  if (profile.wins) lines.push(`${profile.reBetAfterWin} of ${profile.wins} recorded wins were immediately followed by a bet within 30 seconds in the same session.`);
  if (pt.deposits) lines.push(`${Math.round(pt.paydayDepositShare * 100)}% of deposits fell on UTC days 1–3 or 28–31. Your actual payday and reasons for depositing are not known.`);
  lines.push('These records describe behaviour, not a diagnosis or proof of platform targeting. Missing or incomplete records can change the picture. Historical returns do not predict your next session.');
  lines.push('You can step away now. Choose a next action, write a check-in, or reach out for support. You do not need a particular score to ask for help.');
  return lines.join('\n\n');
}
module.exports = { recoveryMath, pressureTimeline, mirrorNarrative };
