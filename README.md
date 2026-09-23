# Addiction Breaker

A standalone tool for seeing gambling patterns, writing private check-ins, and choosing a next step. Version 0.4 connects the original analytics engine to a usable web application. No account, AI subscription, or database is required.

## Run the application

Install Node.js **22.22.2+, 24.15.0+, or 26+**, then in this folder:

```sh
npm start
```

Open **http://127.0.0.1:3737**. No package installation or build step is required to run the app. Keep the terminal open while using history analysis. Stop with Ctrl+C.

The server listens only on your own computer by default. This address will not open the application on a different device. A hosted HTTPS deployment is needed for convenient phone access; see `docs/DEPLOYMENT.md`.

## What works

- **Today:** daily check-in for urge, loneliness, meaningful contact, rest and money pressure; editable notes and whether gambling occurred.
- **Pause:** ten-minute timer and a choice of simple actions; a personal next-step plan. The timer resets on page refresh.
- **Journal & Echoes:** exact earlier notes from reported non-gambling days with high urge; recent averages and entry editing/deletion. The latest 100 entries are displayed; backups include all entries.
- **Your mirror:** CSV, TSV, comma-separated TXT and JSON event exports; counted re-bets, stakes, returns and a descriptive narrative. Missing values stay unknown. A separate fictional sample is included.
- **Support:** verified NHS/GamCare links, including text options, plus privacy and evidence explanations.
- **Data controls:** opt-in browser persistence, export/restore and erase. No journal data is sent to the server.
- **Offline shell:** after an initial successful visit and service-worker installation on localhost or HTTPS, the journal and pause can load offline. History analysis still needs the server. Browser install/offline behaviour has not yet been device-tested.

## Privacy

By default entries live only in the current page. Refreshing or closing loses them. “Remember” stores the journal and plan unencrypted in this browser profile, with no cross-device sync. Anyone with access to the profile may read them. Exported JSON backups contain personal notes in plain text.

History uploads require acknowledgement and are processed by the Node server in memory, not written to disk or logged by application code. A hosting provider or reverse proxy may maintain its own logs; configure it appropriately. Clear Analysis removes displayed results. Files must use one currency. Upload limits: 2 MiB, 20,000 rows, 100 people. Journal backups: 5 MiB and 5,000 entries.

## Input contract

Each row represents an event, not a bank transaction summary or a combined bet/result row:

```csv
ts,userId,action,stake,payout,amount,sessionId
2026-09-01T20:00:00Z,me,bet,10,,,session-1
2026-09-01T20:00:01Z,me,win,,5,,session-1
```

`payout` is the total money returned, including returned stake, not net profit. Supported actions: `login`, `deposit`, `bet`, `win`, `loss`, `near_miss`, `withdraw`, `logout`; common aliases are mapped. Required columns are timestamp and action. Use ISO timestamps with a timezone, or epoch timestamps. Missing user IDs become `unknown-user`; missing session IDs are inferred after a 30-minute gap or logout. Do not combine multiple people's records without IDs.

Missing payout columns, missing monetary values, or fewer outcome records than bets suppress net-loss/RTP conclusions. A column's presence cannot prove the export is complete; all conclusions are conditional on the supplied records. Malformed money and inconsistent CSV columns are rejected. Unknown actions and bad timestamps are counted and reported as dropped rows.

## Evidence boundaries

The Hook Score is an **unvalidated descriptive index**, developed with synthetic data. It is not a diagnosis, relapse probability, severity grade, or measure of recovery. The interface puts observed counts first. UTC night hours may differ from the person's local time; calendar deposit clusters cannot establish their payday or financial pressure.

Historical RTP does not forecast future returns. `recoveryMath(profile)` now returns no forecast by default; its optional second argument is an explicit assumed RTP for a hypothetical expectation, never a probability of recovering losses. This is a deliberate API change from v0.3: forecast fields may now be `null`.

Read `NEW_LIFE.md` for the revised product manifesto and `docs/ARCHITECTURE.md` for boundaries. Original synthetic reports in `output/` and `docs/FINDINGS.md` are research artifacts, not user guidance, and are not served by the web app.

## Development and verification

```sh
npm ci
npm test
```

The only development dependency is pinned `jsdom`, used for interface tests. There are zero runtime dependencies. `npm run test:core` works without installation; `npm run test:ui` requires development dependencies. CI is configured for Node 22 and 24.

Tests cover legacy engine behaviour, corrected loss streaks, missing data, API upload limits and origin checks, persistence, exact Echo text, hostile text rendering, backup restore, save failures and navigation. DOM tests do not replace real-browser rendering, accessibility, installation or offline checks. See `handoff.txt` for verified and outstanding work.

Original research commands remain available (`npm run run`, `demo:journal`, `demo:markov2`, `demo:streak`, `demo:backoff`, `demo:adapter`, `demo:gate`, `sweep`). They generate synthetic outputs; Python chart scripts additionally require `requirements.txt`.

## Licence

See `LICENSE`, including the project's ethical note. This project is intended to help people understand gambling harm, not optimise compulsive engagement.
