# Run and deploy

## Private local use

Run `npm start`, then open `http://127.0.0.1:3737` on the same computer. No installation is needed for runtime dependencies. Keep a stable scheme/host/port: browser storage belongs to that exact origin. Back up before changing it.

## Hosted phone access

Use a Node-capable host or container behind HTTPS. This repository is not a static-only site: `/api/analyze` needs the Node process. It is not directly compatible with Cloudflare Workers without a separate runtime adapter.

Environment variables:

| Name | Default | Meaning |
|---|---|---|
| `HOST` | `127.0.0.1` | Bind address; containers typically require `0.0.0.0` |
| `PORT` | `3737` | HTTP listener port |
| `ALLOWED_HOSTS` | empty | Comma-separated public hostnames allowed to upload; no scheme or port |

Start command: `node web/app.js`. Health check: `GET /api/health` → `{"status":"ok"}`. The reverse proxy must preserve the public Host header for same-origin checks.

Before public release:

- Configure HTTPS and HSTS at the reverse proxy. Never expose real history uploads over plain HTTP.
- Apply request rate/concurrency limits at the edge and test them. Parsing is synchronous and bounded but public traffic can still exhaust capacity.
- Limit the body to 2 MiB and disable request-body logging or third-party session replay. Review provider logging and retention.
- Use a dedicated origin and document its privacy terms. Browser journal data is unencrypted and has no account access boundary.
- Run `npm ci && npm test` on the deployment runtime.
- Test Android/desktop navigation, keyboard focus, slider labels, uploads, download/restore, persistence across reload, offline shell and deletion in real browsers.
- Verify support links and have recovery-facing claims reviewed by an appropriate specialist before a broad launch.

A private test deployment is preferable before a public launch. No deployment, domain change or repository push is part of the local build delivered in this session.
