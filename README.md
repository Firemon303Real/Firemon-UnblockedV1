# Firemon Unblocked

A web proxy browser powered by Scramjet.

## Run locally

Requires Node.js 20 or newer. In Windows PowerShell, run these commands from the project directory:

```powershell
Set-Location "C:\Users\storm\Documents\Codex\2026-11-03\cr\outputs\firemon-unblocked"
npm.cmd install
npm.cmd start
```

Open http://localhost:8789. Local runs bind to 127.0.0.1, so the proxy is available only on your own computer unless you explicitly configure a public host.


## Add games with Game Manager

On Windows, double-click Open Game Manager.cmd in the project folder. This opens a separate local utility at http://127.0.0.1:8790/. It does not start or connect to Firemon and does not use the proxy server's HOST, password, or session-secret settings. Select a title, optional description, one .html or .htm game file (up to 8 MB), and a PNG, JPG, or WebP cover image (up to 5 MB).

The utility writes the game HTML into public/games/, its cover into public/game-logos/, and registers both in game-library.json. Restart Firemon to load the added games. To include them in the public website, deploy the updated project files. Uploaded HTML runs as same-origin game content, so only add files you trust.

## Deploy safely

This server will refuse to start on a non-loopback interface unless you configure all of the following as environment variables in your hosting provider:

- `HOST=0.0.0.0`
- `FIREMON_ACCESS_PASSWORD`: a unique password of at least 12 characters
- `FIREMON_SESSION_SECRET`: a random secret of at least 32 bytes
- `TRUST_PROXY`: the exact trusted proxy configuration for your host, such as `1` only when the app is reachable solely through one trusted TLS proxy

Set `NODE_ENV=production` as well. Put TLS/HTTPS at the trusted reverse proxy, block direct public access to the Node port, and make the reverse proxy set `X-Forwarded-Proto: https`. Firemon rejects public requests that do not arrive as HTTPS and applies the same checks to the Wisp WebSocket. Do not set `TRUST_PROXY=1` if clients can reach the Node server directly; use your platform's documented trusted proxy IP ranges instead.

The login password is checked by the server, is rate-limited, and is never included in browser code. Successful logins use a signed, HttpOnly, SameSite=Strict session cookie that expires after 12 hours. No `.env` file is needed or served; configure secrets in the host's secret/environment settings. A local `.env` is ignored by Git.

## Security scope

This project has no user accounts, database, invoices, row data, or admin page. Those application-specific examples do not exist here. The proxy's deployment password protects the HTTP app, static runtime files, and Wisp WebSocket when it is publicly bound. HTTPS termination, firewalling, and secret storage still depend on the hosting provider being configured as described above.

Scramjet uses WebSockets, so the hosting provider must support them. Serverless platforms without WebSocket support are unsuitable. Scramjet is experimental and site compatibility varies.

- Scramjet: https://github.com/MercuryWorkshop/scramjet
- Integration guide: https://docs.crllect.dev/guides/wiring
