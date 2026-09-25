# Addiction Breaker

Version 0.7 adds a multi-page personal dashboard, five addiction-support journeys, and optional Google accounts with Cloudflare D1 journal sync. Guest use, local analysis and backups still work without an account. The feature branch is deployed to an isolated Cloudflare preview. Google login and initial sync were confirmed by the owner; production release remains separate.

## Run the application

Use Node.js **22.22.2+, 24.15.0+, or 26+**:

```sh
npm ci
npm start
```

Open http://127.0.0.1:3737. The local Node preview is guest-only. Cloudflare deployment and credential setup are documented in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Pages and capabilities

| Page | What it does |
|---|---|
| `/start/` | Choose support journeys, continue without an account, or sign in |
| `/dashboard/` | Active-journey check-ins, relevant support and your shared plan |
| `/journeys/` | Choose several interests and open gambling, alcohol, smoking, drugs/medication concerns or compulsive-behaviour information pages |
| `/check-in/` | Category-specific daily reflection, ratings and notes |
| `/pause/` | Ten-minute pause with tab-session timer recovery and a next-step plan |
| `/journal/` | Entries, exact earlier Echoes, search and date filters, edit/delete |
| `/mirror/` | Local gambling-history analysis from CSV, TSV or JSON |
| `/support/` | Support links, privacy, journal export/restore and device erasure |
| `/account/` | Google sign-in, explicit sync consent, guest import, conflict resolution, cloud export, logout and account deletion |

Each route has its own generated directory/index page and can be opened directly. Internal navigation preserves in-memory work. Existing hash links remain supported. Desktop uses a sidebar; mobile uses bottom navigation and a More menu. The original illustration and optional local piano remain.

New visitors start with a choice of journeys, including General / not sure. Existing gambling records remain gambling records. A shared account can contain one entry per date per category; the dashboard and journal display only the active category. Gambling alone uses the existing Echo retrieval and gambling-history analysis. Other check-ins use category-appropriate questions, without clinical scoring or detox instructions. The plan is explicitly shared across journeys.

Version 2 backups include the support profile and category on every entry. Version 1 backups are still accepted and interpreted as gambling. Cloud reads normalize old records without rewriting them; older clients cannot overwrite an already-upgraded cloud document. Support choices follow the same optional saving and syncing choices as the journal.

## Saving and privacy

Guest entries start in page memory. Refreshing or closing loses them unless **Remember my journal** is enabled. That switch takes effect immediately and also enables form-draft saving. Browser storage and exported backups are unencrypted.

Google sign-in alone does not upload guest notes. Account journals have separate browser storage. Cloud sync requires an explicit choice; importing the old guest journal requires a separate confirmation. Sync sends journal entries and the plan to Cloudflare; this is **not end-to-end encryption**. Conflicting device versions pause for an explicit choice instead of silently overwriting. Pending changes survive a refresh only when device saving is enabled. Signing out clears the account's browser copy; the separate guest copy remains.

Device erasure turns off sync and does not delete existing cloud records. Account deletion removes the application's account, journal and sessions; downloaded backups and provider-retained backups are separate. This service does not monitor journals or dispatch emergency help.

Selected gambling-history exports are processed locally in a Web Worker and never uploaded. History limits: 2 MiB, 20,000 rows, 100 people, one currency per file. Local journal backups: 5 MiB and 5,000 entries. Cloud request limit: 1 MiB including request metadata; a document very close to the limit may be rejected. The app shell caches public code only, never API responses or journal data. Actual Android install/offline and visual-browser checks remain release gates.

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

Pinned `jsdom` supports DOM tests, Wrangler builds Pages Functions and exercises local D1, and `jose` validates Google ID tokens on the server. CI covers Node 22 and 24. `npm test` includes UI, account API and sync tests; `npm run functions:build` verifies the deployment bundle.

Tests cover legacy engine behaviour, corrected loss streaks, missing data, API upload limits and origin checks, persistence, exact Echo text, hostile text rendering, backup restore, save failures and navigation. DOM tests do not replace real-browser rendering, accessibility, installation or offline checks. See `handoff.txt` for verified and outstanding work.

Original research commands remain available (`npm run run`, `demo:journal`, `demo:markov2`, `demo:streak`, `demo:backoff`, `demo:adapter`, `demo:gate`, `sweep`). They generate synthetic outputs; Python chart scripts additionally require `requirements.txt`.

## Licence

See `LICENSE`, including the project's ethical note. This project is intended to help people understand gambling harm, not optimise compulsive engagement.
