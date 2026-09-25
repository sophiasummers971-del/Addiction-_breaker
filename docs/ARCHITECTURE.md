# Architecture — v0.7

## Runtime and routes

`scripts/build-static.js` builds a public asset allowlist, bundled browser analysis worker, security headers and individual route directories, including the first-visit /start/ flow. All pages share a shell, but `/dashboard/`, `/check-in/`, `/pause/`, `/journal/`, `/mirror/`, `/support/`, `/account/` and `/journeys/*/` are actual server paths. Client navigation preserves page memory and moves focus. Only `/api/*` invokes Pages Functions, via `_routes.json`.

`web/app.js` is the guest-only Node preview with a legacy bounded analysis endpoint. Production analysis runs entirely in the browser; production accounts run through `functions/api/[[path]].js` and `server/api.mjs`.

## Data boundaries

| Data | Location and lifetime |
|---|---|
| Guest journal/plan | Page memory, or unencrypted localStorage after explicit opt-in |
| Account browser journal | Separate key per random application account ID, same device-saving opt-in |
| Form draft | Current context only; persisted only with device saving |
| Pause timer | sessionStorage timestamp, survives refresh within tab session |
| Journey interests | Included in journal profile; same optional device/cloud saving |
| Cloud journal/plan | D1 snapshot, optional explicit sync |
| Account identity | D1 Google subject, display name, email, random internal ID |
| Auth session | Secure HttpOnly SameSite=Lax host-only cookie; hash and CSRF token in D1; seven-day expiry |
| Google challenge | Hashed state plus verifier/nonce, ten-minute expiry, atomically consumed |
| History files/results | Browser worker/memory only, never sent to account API |
| Service-worker cache | Public shell allowlist, no API interception |
| Downloaded backups | User-managed plaintext JSON outside server deletion |

## Auth and sync

Google authorization uses state, PKCE S256 and nonce. The callback exchanges against fixed Google endpoints and verifies signed RS256 ID tokens with `jose`, Google issuer/audience/expiry, verified email, nonce and authorized-party checks. Accounts are keyed by Google subject, not email. No Google access/refresh token is retained. Unconfigured or mismatched origins fail closed.

Authenticated mutations require exact `Origin` and session-bound `X-CSRF-Token`. Queries always select by server-derived account ID. JSON size, dates, ratings and string lengths are bounded. Login and account API rate limits are D1-backed. API responses are no-store and noindex. Application code does not log notes or credentials.

Cloud updates carry an expected revision; a single SQL conditional update increments it. Concurrent writes cannot both win. The client keeps its current data on 409 and requires a cloud/device choice. It only marks the captured revision synced after success, retains newer edits while an older request finishes, and retries when online. Pending device changes are durable only with local saving. Separate guest data requires explicit import, never automatic login migration.

Device erasure stops client sync without deleting cloud data. Account deletion transactionally removes the identity, journal and sessions. OAuth challenges are anonymous pre-auth records, expire in ten minutes, and are consumed or pruned at subsequent login. Expired sessions/rate rows are also pruned on login.

## Analysis and support boundaries

`src/analysis.js` validates history and suppresses financial conclusions with insufficient evidence. `src/journal.js` retrieves exact prior notes from high-urge, explicitly non-gambling days. Neither is a clinical risk model. Hook Score remains an unvalidated descriptive index; it does not diagnose or measure recovery. Research/Markov experiments remain separate and unpublished.

`journeys.js` offers source-linked, UK-focused signposting. Each category has a contextual reflection check-in. Gambling alone uses historical analysis and Echoes. These tools are not treatment. Alcohol guidance includes withdrawal escalation and explicitly avoids detox instructions. Clinical review and live link review remain necessary before making treatment or commercial claims.

## Verification limits

API tests use real SQLite through a D1-shaped adapter. A function-argument-only test seam substitutes verified Google claims; it is never configurable from production bindings. Actual Google login, Cloudflare deployment, Android rendering and installed-app/offline behaviour must be verified in a configured preview. See DEPLOYMENT.md and handoff.txt.

## Journal v2 compatibility

Every entry has an explicit category. Gambling uses played; other categories use engaged. Uniqueness is category plus date. Legacy version 1 is always interpreted as gambling, never relabelled to the active choice. Profile categories/active journey travel with cloud snapshots and backups. The next-step plan is shared. Existing rows normalize on read without being rewritten; a v1 client cannot overwrite a row already written as v2. Session-only onboarding choice may cross the Google redirect; existing account choices take precedence.
