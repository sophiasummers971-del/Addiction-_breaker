# Standalone architecture — v0.4

## Runtime

`web/app.js` uses Node's built-in HTTP server. Static routes are an explicit allowlist; source files, research output and arbitrary paths are not exposed. The exception is `src/journal.js`, intentionally served as `/journal.js` so the browser and research tools use the same Echo retrieval rule.

`web/public/app.js` connects semantic HTML controls to shared journal logic and `store.js`. No bundler, remote scripts, fonts, telemetry or runtime packages are required. `sw.js` caches only a named list of static app assets. It never intercepts POST requests or caches analysis results. Bump its cache version whenever the shell changes. Offline shell use requires a successful initial service-worker installation; analysis requires a reachable server.

## Boundaries

| Area | Location | Persistence |
|---|---|---|
| Journal, next-step plan | Browser JavaScript | Page memory by default; localStorage after opt-in |
| Echo retrieval | Browser, `src/journal.js` | Uses existing journal only |
| Backup | User-triggered JSON download | User-managed file, unencrypted |
| History upload | POST `/api/analyze?name=...`, raw text/plain | Server memory only |
| Analysis results | Browser DOM | Until cleared or refreshed |
| Cached app shell | Browser Cache Storage | Static assets, no personal data |
| Research fixtures and model experiments | CLI only | Existing `output/` artifacts |

## Analysis

`src/analysis.js` is the web-facing validation and evidence boundary. It limits rows/users; detects columns; calls the adapters; checks monetary values; reports omitted records; and suppresses financial conclusions without stake, payout and outcome coverage. It does not infer a casino's intent or a user's diagnosis. No Markov prediction of future gambling outcomes is presented in the app.

`src/model.js` counts behaviour within sessions. The corrected implementation retains consecutive losses across bets and computes acceleration from bet-to-bet timestamps. Changed calculations mean old synthetic score totals are historical rather than current calibration.

`src/truth.js` supplies a descriptive narrative and optional explicitly assumed RTP scenario math. `recoveryMath` forecast fields are null without an assumption. A past RTP is never automatically used as expected future return.

Research Markov/backoff/simulation modules remain separate from the user-facing flow. Running experiments does not modify a person's journal.

## Journal

One validated entry per local calendar date, no future dates, integer ratings 0–10, explicit boolean gambling response, notes up to 4,000 characters. Backups are versioned and reject duplicate dates. Restore validates the entire candidate before replacing current data. Failed storage writes do not claim success. A cross-tab change pauses writes to avoid blindly overwriting newer data; unreadable saved data is preserved until the user explicitly erases it.

Echoes use strictly earlier dates, explicit non-play, a non-empty note, and urge ≥6. This is a retrieval heuristic, not a relapse model. Journal averages use the last seven calendar days and do not impute missing entries.

## Security

Loopback default, bounded request bodies, row/user limits, same-origin checks, configurable host allowlist, CSP without inline scripts/styles, no framing, no sniffing, no referrer, and a static asset allowlist. All uploaded/journal strings enter the interface through `textContent`, not HTML interpolation. No personal content is logged by application code.

Public hosting needs HTTPS and operational controls described in `DEPLOYMENT.md`. The app has no authentication, server-side journal, encryption, cross-device sync, or background risk monitoring. Do not market it as a validated medical intervention.
