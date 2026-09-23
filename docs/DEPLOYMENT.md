# Cloudflare Pages deployment — v0.5

The production app is static. Gambling histories are analysed in a browser Web Worker, without uploading personal records or invoking Cloudflare Functions. Journal data stays in the browser. No database, AI service, server binding, domain purchase or paid-plan upgrade is required.

Cloudflare documents static Pages requests as free and unlimited on both free and paid plans: https://developers.cloudflare.com/pages/functions/pricing/ . Build/platform quotas still apply; no paid feature is enabled by this configuration.

## Git-connected Pages settings

- Repository: `sophiasummers971-del/Addiction-_breaker`
- Production branch: `main`
- Build command: `node scripts/build-static.js`
- Output directory: `dist`
- Environment: `NODE_VERSION=24.19.0`, `SKIP_DEPENDENCY_INSTALL=true`
- Preview deployments: disabled unless intentionally enabled later
- Web analytics: disabled
- Functions / storage / AI bindings: none

The static build uses only Node built-ins; package installation is unnecessary. Development dependencies are for tests only. The build copies an explicit asset list, emits the analysis worker, a custom 404 page, and security headers. Never upload the whole repository as public assets.

## Local run

`npm start` builds assets and starts the development server at http://127.0.0.1:3737. The legacy POST analysis endpoint remains available locally for compatibility, but the browser UI never calls it. It is not deployed to Pages.

## Release checks

Run `npm ci && npm test`. Check the deployed HTTPS app: navigation, local file analysis, check-ins, Echoes, storage opt-in and reload, restore/export, and support links. Browser install/offline behaviour should be checked on actual devices. A static deployment must not contain `_worker.js` or a Functions directory.

## Updates and personal data

Git-connected builds publish changes to main. Keep the production domain stable: journal storage belongs to the exact origin. Before moving a site, export journal backups. Restoring does not enable persistent storage automatically.

The service worker caches application code only; bump its cache name when the asset set changes. Personal entries and analysis results are never cached by the service worker. Browser storage and downloaded backups remain unencrypted.
