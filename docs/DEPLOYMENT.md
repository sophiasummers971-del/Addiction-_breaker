# Cloudflare Pages deployment — v0.6

The app has public static pages plus optional Pages Functions and a D1 account database. Guest use does not require Google credentials or a database. Personal gambling-history files are always analysed locally.

## Local development

Use Node 22.22.2+ or 24.15.0+ (CI covers 22 and 24):

```sh
npm ci
npm test
npm start
```

The local Node server at http://127.0.0.1:3737 is guest-only. It explicitly reports accounts as unconfigured. Do not mistake a guest preview for a working Google deployment.

Validate the Cloudflare bundle and local database:

```sh
npm run functions:build
npm run db:local
npm run pages:dev
```

`db:local` only migrates local Wrangler storage. Production auth requires HTTPS and an exact matching `APP_ORIGIN`. Do not weaken that check or remove secure cookies for local testing. Backend tests use real SQLite and a test-only function argument for Google's verified identity response; production cannot enable that seam with an environment variable.

## One-time production setup (not performed by this implementation)

1. Create a D1 database named `addiction-breaker` in the same Cloudflare account as the Pages project. Replace the all-zero `database_id` in `wrangler.jsonc` with its real ID. The all-zero value is intentionally a local placeholder, not a deployment-ready database.
2. Review and apply `migrations/0001_accounts.sql` to that database, then bind it as `DB` to the Pages production environment. The migration creates new tables; it imports no guest data.
3. In Google Cloud, configure the OAuth consent screen and create a Web application OAuth client. Authorise the exact redirect URI `https://addiction-breaker.pages.dev/api/auth/google/callback`. Configure test users while consent is in testing, or complete Google's publishing requirements. Do not put the client secret in Git or chat.
4. Set both `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as Secrets in Cloudflare Pages. Set `APP_ORIGIN=https://addiction-breaker.pages.dev`. Use Secret type for both in preview too: Wrangler-managed vars overwrite dashboard Text entries on deploy. Google stores the identity; this app stores the corresponding subject, email and display name.
5. Change the existing Pages build settings: remove `SKIP_DEPENDENCY_INSTALL=true`, use `npm run build`, output `dist`, and supported Node 24. Dependencies now include `jose`, needed when Functions are bundled. Keep analytics disabled.
6. Review the branch and release checks before merging or deploying. Git-connected main changes deploy automatically. This implementation has not merged or deployed anything.

Production project: `addiction-breaker`, repository `sophiasummers971-del/Addiction-_breaker`. A custom domain is optional. If added later, update `APP_ORIGIN` and the authorised Google callback together. Guest localStorage belongs to each exact origin; export before moving domains.

## Release gates

- `npm ci`, `npm test`, `npm run functions:build`, and local D1 migration succeed.
- On a dedicated preview with its own D1 and Google callback, verify actual Google sign-in, cancellation, repeat sign-in, logout and expiry. Never bind a public preview to production private data.
- Verify guest data does not upload on login; explicit sync/import; two-device conflict choices; offline retry; export/restore; deletion and isolation between two real accounts.
- Check narrow Android and desktop layouts, keyboard focus, accessible controls, refresh on each real page path, installed-app behaviour and offline loading. Google sign-in may require the normal browser rather than an embedded WebView.
- Confirm API responses are private/no-store and service worker never caches `/api/*`.
- Confirm privacy/support copy and provider retention terms before opening to public users. Informational content has source links; this is not clinically validated treatment.

## Free-tier and rollback boundaries

No paid services or upgrades are enabled here. Static assets and Functions/D1 have different quotas; monitor usage and confirm current free limits before launch. Rate limits reduce accidental abuse but do not guarantee zero infrastructure cost on a paid account.

If the account service is unavailable, guest tools remain usable and existing guest data stays local. Disabling cloud sync does not delete cloud records. Account deletion removes application rows and all active sessions; provider backups follow provider retention. Downloaded backups are outside server deletion.

Keep the previous Pages deployment available for rollback. A code rollback does not undo D1 records. Do not drop the account database as a rollback shortcut. The service worker caches only public shell assets and removes older shell caches on activation.
