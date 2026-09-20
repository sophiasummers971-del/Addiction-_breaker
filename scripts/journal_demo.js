const OUT = require('path').join(__dirname, '..', 'output');
/**
 * journal_demo.js — generates a synthetic 60-day journal history with a real arc,
 * runs the journal analytics, prints the report, and writes an echo sheet.
 * Demonstrates: pre-relapse signature, isolation creep, resistance peaks.
 */
const fs = require('fs');
const { riskSignature, analyzeJournal, findEchoes, nightlyPrompt, renderEchoSheet } = require('../src/journal');

const PEAK_NOTES = [
  "Money is tight and the urge is loud but I am not feeding it tonight. I ate, I showered, I texted my sister. The night passed before.",
  "Lonely as hell. Almost opened the site. Instead wrote three lines here and went to bed. Tomorrow-me says thank you.",
  "Payday hit and the pressure lit up immediately. I moved the money to savings and locked the card. Small win. Real win.",
  "Wanted the noise gone, not the money. Named it. It got quieter. Not gone — quieter. Enough.",
  "Third hard night this week. Held all three. That is not luck, that is me.",
];

function generateJournal(days = 60, seed = 7) {
  const s = { s: seed };
  const r = () => { s.s = (s.s * 1664525 + 1013904223) % 4294967296; return s.s / 4294967296; };
  const entries = [];
  const start = Date.UTC(2026, 6, 22); // 2026-07-22
  for (let d = 0; d < days; d++) {
    const date = new Date(start + d * 86400000).toISOString().slice(0, 10);
    const dom = new Date(start + d * 86400000).getUTCDate();
    const pressureDay = dom <= 3 || dom >= 28;
    const phase = d / days; // isolation creep over the arc

    // loneliness & urge climb across the arc; social contact falls
    const loneliness = Math.min(10, Math.round(1 + phase * 7 + (pressureDay ? 2 : 0) + r() * 2));
    const social = Math.max(0, Math.round(6 - phase * 5 - (pressureDay ? 1 : 0) + (r() < 0.25 ? 2 : 0)));
    const financialStress = Math.min(10, Math.round(pressureDay ? 7 + r() * 3 : 2 + r() * 4));
    const sleep = Math.min(10, Math.round(4 + r() * 5));
    const urge = Math.min(10, Math.round(1 + phase * 6 + (loneliness > 7 ? 2 : 0) + (pressureDay ? 1 : 0) + r() * 2));

    // relapse happens when the signature stacks — one clear slip mid-arc, then recovery
    const sig = { date, urge, loneliness, social, sleep, financialStress, played: false, spent: 0, tags: [], note: '' };
    const danger = (urge >= 6 && loneliness >= 6 && financialStress >= 6);
    let played = false;
    if (d === 34 && danger) played = true;                 // the slip
    else if (danger && r() < 0.06) played = true;          // rare noise

    const tags = [];
    if (pressureDay) tags.push('payday');
    if (loneliness >= 6) tags.push('lonely');
    if (sleep <= 3) tags.push('tired');
    if (financialStress >= 6) tags.push('money');

    let note = '';
    if (played) {
      note = 'Relapsed tonight. Started as "just to feel something." Did not. Deeper now. Writing this so tomorrow is not a surprise.';
    } else if (urge >= 6 && PEAK_NOTES.length) {
      note = PEAK_NOTES[Math.floor(r() * PEAK_NOTES.length)];
    } else if (d > 34 && urge >= 4) {
      note = 'Better than last week. Urge there but smaller. Went for a walk instead.';
    }

    entries.push({ ...sig, played, spent: played ? 40 + Math.round(r() * 200) : 0, tags, note });
  }
  return entries;
}

/* ---- run ---- */
const entries = generateJournal();
console.log('══════════ JOURNAL REPORT ══════════');
console.log('Entries:', entries.length);

const stats = analyzeJournal(entries);
console.log('\n[ Correlations ]');
console.log('  urge <-> loneliness r =', stats.urgeLoneliness_r.toFixed(2),
  stats.urgeLoneliness_r > 0.5 ? '(strong: the urge is largely loneliness wearing a mask)' : '');
console.log('\n[ Pre-relapse signature ]');
console.log(`  danger-signature days: ${stats.dangerDays}  | relapse rate on those days: ${(stats.dangerRelapseRate * 100).toFixed(0)}%`);
console.log(`  all other days:                             relapse rate on those days: ${(stats.safeRelapseRate * 100).toFixed(0)}%`);
console.log('\n[ Isolation creep ]');
console.log(`  social contact: ${stats.isolation.socialEarly.toFixed(1)} -> ${stats.isolation.socialLate.toFixed(1)} (${(stats.isolation.socialChangePct * 100).toFixed(0)}%)`);
console.log(`  loneliness:     ${stats.isolation.lonelyEarly.toFixed(1)} -> ${stats.isolation.lonelyLate.toFixed(1)}`);
console.log(`  "silent" days (no urge, no contact, no play): ${stats.silentDays}`);
console.log('\n[ Top triggers before a hard day ]', stats.topTriggers);
console.log('\n[ Resistance peaks — the armor days ]', stats.resistancePeaks.length, 'days you held at high urge');

// Echo sheet for today (a high-urge day)
const today = { date: '2026-09-20', urge: 8, loneliness: 8, financialStress: 7 };
const echoes = findEchoes(entries, today, 3);
console.log('\n' + renderEchoSheet(today, echoes));

// nightly prompt example
console.log('\n' + nightlyPrompt(today));

// save artifacts
fs.writeFileSync(OUT + '/journal_entries.json', JSON.stringify(entries, null, 2));
fs.writeFileSync(OUT + '/journal_report.md',
  '# Journal Report\n\n' +
  `- urge↔loneliness r = ${stats.urgeLoneliness_r.toFixed(2)}\n` +
  `- danger-signature relapse rate: ${(stats.dangerRelapseRate * 100).toFixed(0)}% vs baseline ${(stats.safeRelapseRate * 100).toFixed(0)}%\n` +
  `- social contact trend: ${stats.isolation.socialEarly.toFixed(1)} → ${stats.isolation.socialLate.toFixed(1)}\n` +
  `- silent days: ${stats.silentDays}\n\n` +
  renderEchoSheet(today, echoes) + '\n');
console.log('\nWrote journal_entries.json + journal_report.md');
