# Product roadmap

This document separates implemented capabilities from possible future work. It is not a delivery or subscription promise. The application provides reflection and support signposting; it is not clinical treatment, a detox service or emergency monitoring.

## Current foundation

- Personal support profile with gambling, alcohol, smoking, drugs/medication concerns, compulsive behaviours and a General / not sure option.
- Separate dashboard, check-in, pause, journal, analysis, support, account, settings, FAQ and roadmap pages.
- Device appearance preference, optional trigger/coping tags and a shared-plan writing helper.
- One check-in per journey per date, a shared plan and category-filtered journal history.
- Optional local persistence, JSON backups and legacy gambling-journal import.
- Optional Google identity and explicit Cloudflare sync, with revision conflict choices and account deletion.
- Gambling-history files analysed on-device rather than uploaded to the account server.

Deployment configuration and real-device verification remain separate from feature implementation. The latest verified status belongs in `handoff.txt`.

## Release completion work

- Settings and FAQ should explain saving, cloud consent, shared-device use, backup/restore, sign-out and deletion in ordinary language.
- Appearance controls should be optional and accessible, with legible contrast, keyboard operation and respect for reduced-motion preferences.
- Verify that new pages are reachable through navigation and direct links, and included correctly in public offline shell caching.
- Verify production identity configuration and a separate production database; keep preview personal data out of production.
- Test account separation, interrupted connections, conflicting device versions, backup recovery and deletion on real devices.

These items are work in progress until the release evidence records successful implementation and checks. They are not claims that tests have already passed.

## Possible next improvements

1. **Optional reminders.** User-chosen timing and neutral notification wording; off by default. Clear controls for permission, stopping reminders and avoiding sensitive lock-screen text. No assumption that reminders improve clinical outcomes.
2. **Richer personal reasons and goals.** The current helper already adds user-written reasons to the shared plan. Future dedicated goals could offer Private, editable statements about what a person wants to protect or change. Avoid compulsory abstinence goals, shame messages or punitive streak resets.
3. **Richer coping logs.** Optional trigger/coping tags already work within daily check-ins. Future multiple-moment logs could record a trigger, the action tried and a personal reflection on whether it helped. Keep free text optional and explain storage/sync before collecting additional information.
4. **Practical portability.** Improve export and recovery explanations and test changing devices or domains without implying browser data transfers automatically.

Changes to stored profile/journal fields need an explicit compatible schema update, validation, export/restore tests and older-client overwrite protection. Do not squeeze new sensitive fields into unrelated existing properties.

## Membership and pricing

Premium features, pricing and a membership system are undecided. No payment integration or paid entitlement is promised here. Essential pause tools, safety information and routes to help must not be put behind a paywall. Do not sell or target advertising from sensitive journal entries.

## Outside the present scope

- Diagnosis, withdrawal/detox schedules, medication dosing or medical predictions.
- Automatic crisis detection or emergency dispatch.
- Social comparison, engagement pressure or recovery leaderboards.
- Reading provider-generated gambling histories on the server without a separately explained need and opt-in.
- Claims of end-to-end encryption, guaranteed data recovery or unlimited free cloud usage.
