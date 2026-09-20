/**
 * journal.js — the daily journal engine.
 *
 * WHY THIS EXISTS (in the user's own framing):
 *  - "addictions' most successful attacks happen unseen — visible only when too late."
 *    → so the journal's job is to make the UNSEEN visible in the moment:
 *      track the pre-relapse signature and flag it BEFORE it fires.
 *  - "it makes you lonely... you isolate more and more... one day there is no one."
 *    → so we track the ISOLATION CREEP over time and show it as a curve,
 *      plus how urge tracks it. Not to shame — to reveal.
 *  - "having something to write the shit out of the head... see what the user
 *    then wrote before" → so we build ECHOES: when today's state matches a past
 *    peak-resistance day, we hand back that day's OWN note verbatim.
 *
 * This is scaffolding, not therapy. It makes the invisible pattern arguable.
 */

/* ---------------- Entry schema ----------------
 * { date:'YYYY-MM-DD', day:int,
 *   urge:0-10, loneliness:0-10, social:0-10(# meaningful contacts),
 *   sleep:0-10, financialStress:0-10, played:bool, spent:number,
 *   tags:[...], note:'...' }
 */

const RISK = {
  urgeHi: 6, lonelyHi: 6, stressHi: 6,
};

/** Make TODAY's pre-relapse signature explicit. */
function riskSignature(e) {
  const flags = [];
  if (e.urge >= RISK.urgeHi) flags.push('high urge');
  if (e.loneliness >= RISK.lonelyHi) flags.push('isolation spike');
  if (e.financialStress >= RISK.stressHi) flags.push('money pressure');
  if (e.social <= 1) flags.push('no real contact today');
  if (e.sleep <= 3) flags.push('depleted sleep');
  const score = flags.length === 0 ? 0
    : Math.round(100 * (flags.length / 5) * (1 + e.urge / 20));
  return { flags, score: Math.min(100, score), danger: flags.length >= 3 };
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

/** Core analytics over a journal history. */
function analyzeJournal(entries) {
  const n = entries.length;
  const urge = entries.map(e => e.urge);
  const lonely = entries.map(e => e.loneliness);
  const social = entries.map(e => e.social);

  const urgeLoneliness_r = pearson(urge, lonely);

  // Days matching the danger signature
  const dangerDays = entries.filter(e => riskSignature(e).danger);
  const dangerRelapse = dangerDays.filter(e => e.played).length;
  const safeDays = entries.filter(e => !riskSignature(e).danger);
  const safeRelapse = safeDays.filter(e => e.played).length;

  // Isolation creep: first third vs last third average social contact
  const t = Math.max(1, Math.floor(n / 3));
  const socialEarly = social.slice(0, t).reduce((a, b) => a + b, 0) / t;
  const socialLate = social.slice(-t).reduce((a, b) => a + b, 0) / t;
  const lonelyEarly = lonely.slice(0, t).reduce((a, b) => a + b, 0) / t;
  const lonelyLate = lonely.slice(-t).reduce((a, b) => a + b, 0) / t;

  // Silence: the unseen. Consecutive days with no urge logged or missed entries.
  const silentDays = entries.filter(e => e.urge === 0 && e.loneliness === 0 && !e.played && e.social === 0).length;

  // Top triggers: tags that most often precede a high-urge or played day
  const tagCount = {};
  for (const e of entries) {
    if (e.urge >= RISK.urgeHi || e.played) {
      for (const tg of e.tags) tagCount[tg] = (tagCount[tg] || 0) + 1;
    }
  }
  const topTriggers = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 5);

  // Resistance peaks: highest-urge days the user did NOT play — the armor days
  const peaks = entries.filter(e => e.urge >= RISK.urgeHi && !e.played)
    .sort((a, b) => b.urge - a.urge);

  return {
    days: n,
    urgeLoneliness_r,
    dangerDays: dangerDays.length,
    dangerRelapseRate: dangerDays.length ? dangerRelapse / dangerDays.length : 0,
    safeRelapseRate: safeDays.length ? safeRelapse / safeDays.length : 0,
    isolation: {
      socialEarly, socialLate, socialChangePct: socialEarly ? (socialLate - socialEarly) / socialEarly : 0,
      lonelyEarly, lonelyLate,
    },
    silentDays,
    topTriggers,
    resistancePeaks: peaks,
  };
}

/**
 * ECHOES — the heart of what the user asked for.
 * Given today's state, find past days with a SIMILAR state where the user
 * HELD THE LINE (played === false) and return their own notes verbatim.
 * The user's past self becomes the counselor.
 */
function findEchoes(entries, today, k = 3) {
  const dist = e =>
    Math.abs(e.urge - today.urge) +
    Math.abs(e.loneliness - today.loneliness) +
    Math.abs(e.financialStress - today.financialStress);
  return entries
    .filter(e => !e.played && e.note && e.date !== today.date && e.urge >= RISK.urgeHi)
    .sort((a, b) => dist(a) - dist(b))
    .slice(0, k);
}

/** Nightly prompt — meets the user where they are, not with a generic form. */
function nightlyPrompt(state) {
  const sig = riskSignature(state);
  const base = `Tonight's log — ${state.date}`;
  if (sig.danger) {
    return `${base}\n⚠ Pre-relapse signature detected: ${sig.flags.join(' · ')}.\n` +
      `This is the exact state that has preceded play before. Not a forecast — a pattern.\n` +
      `Write it out. What is the money actually for? What would tomorrow-you want you to do in the next ten minutes?`;
  }
  return `${base}\nWhat pushed on you today? What did you do instead? One honest line is enough.`;
}

/** Render the standalone echo sheet shown when urge spikes. */
function renderEchoSheet(today, echoes) {
  const out = [];
  out.push('════════ THE ECHO ════════');
  out.push(`Right now: urge ${today.urge}/10 · loneliness ${today.loneliness}/10 · money-stress ${today.financialStress}/10`);
  out.push('You have been here before — and you held. These are your own words from those nights.');
  out.push('');
  for (const e of echoes) {
    const sig = riskSignature(e);
    out.push(`— ${e.date}  (urge ${e.urge}/10, loneliness ${e.loneliness}/10, and you did NOT play)`);
    out.push(`  "${e.note}"`);
    out.push('');
  }
  out.push('The urge is a wave. It has crested before. It will crest again.');
  return out.join('\n');
}

module.exports = { riskSignature, analyzeJournal, findEchoes, nightlyPrompt, renderEchoSheet };
