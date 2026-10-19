# Recovery reports: first implementation slice

This feature branch introduces a **weekly structured report preview** in Support & privacy, with browser Print / Save as PDF, limited to Drugs and Gambling.

## Privacy boundary
- The report projector constructs each row from an explicit allowlist: date, category, occurred yes/no, urge rating, and money-pressure rating. It never spreads journal objects and never reads `note`, `tags`, `plan`, or Echoes.
- A missing record is reported **NOT RECORDED**, not no use.
- Self-reports are not clinical proof, proof of abstinence, or proof of attendance.
- Reports are not sent automatically; the owner reviews the preview before using the browser print dialog.
- The existing full journal backup and sync **still include personal `note` content**. Therefore this is NOT the final separate private diary design. Do not market the entire app as having completely separated private diaries yet.

## Important limits before merging or deploying
- Current check-in entries do not collect Open Road's quantity, route, cost, location, prescription and consequences as structured fields. The report does not invent any of these.
- The report currently reads locally saved journal data; test guest session-only mode, synced accounts and multi-device merging before release.
- Browser print output needs physical Android and desktop layout checks.
- Add properly separate private-diary storage, reveal/conceal control, migration of old notes and export restrictions before claiming confidentiality.
- Review accessibility, risk assessment and service-specific expectations before official organisational use.
- Live account and Cloudflare Pages deployments have not been updated by these commits.

## Verification
Run `npm ci && npm test && npm run functions:build`, plus browser tests and manual QA. The new pure unit test is included in `test:core`.

## Separate personal writing space (experimental)
A new Journal-screen personal writing area is stored outside normal JournalStore entries and never included in standard backup, sync or recovery reports. It supports reveal/conceal and opt-in unencrypted device storage. This DOES NOT migrate or isolate old check-in notes; those remain in existing exports/cloud sync. Device storage is not end-to-end encrypted and there is no cross-device diary sync. Do not describe the current product as having complete confidential diary isolation. Test on Android and account context transitions before merge.
