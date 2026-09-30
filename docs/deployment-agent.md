# PTracker VPS deployment runbook

PTracker deploys as static files only. It does not run Node.js, a database, Compose, or an application container in production. The existing HTTPS reverse proxy/static server must own the hostname and serve the configured web root with SPA fallback to `index.html`.

## One-time configuration

1. Copy `scripts/deploy.local.example.ps1` to ignored `scripts/deploy.local.ps1`.
2. Set the SSH target, private-key path, app root, and public HTTPS URL. Never commit this file.
3. Provision the hostname, `/ptracker/` path, and TLS certificate in the shared proxy. A minimal Nginx location example is in `deploy/nginx-ptracker.conf.example`; integrate it deliberately rather than replacing shared proxy configuration.
4. Ensure the SSH user can write only the configured PTracker application directory.

## Routine deployment

```powershell
.\scripts\deploy.ps1 remote-preflight
.\scripts\deploy.ps1 deploy
.\scripts\deploy.ps1 postcheck
```

`deploy` runs all local verification, builds `dist/`, creates a source manifest, uploads one archive, backs up the current static release remotely, extracts to a new release directory, and atomically switches the `current` symlink. Backups and releases remain beneath the configured PTracker app root. It does not touch the shared proxy or other applications.

Before building a release, update the canonical version in `package.json` and the release description in `release.json`. The build emits version metadata, a required-asset manifest, and `sw-<version>.js`. Do not reuse a version number for different application contents. The immutable `service-worker-protocol-v1.js` must never be edited after its first production release; introduce a new protocol file for an incompatible future change.

## Rollback

Rollback is intentionally not automatic. On a failed postcheck the prior `current` target remains named in the deployment output. Switching to it is a production mutation and should be performed only after explicit approval and inspection.

## Static host requirements

- HTTPS and correct MIME types for `.webmanifest`, JavaScript, CSS, SVG, and PNG
- `/ptracker/version.json` and `/ptracker/release-manifest.json` served with `Cache-Control: no-store`
- `/ptracker/sw-<version>.js` served only when it exists, with no SPA fallback
- the immutable protocol worker and hashed `/ptracker/assets/` served with long immutable caching
- unknown `/ptracker/` navigation paths fall back to `/ptracker/index.html`
- `X-Content-Type-Options: nosniff`, a restrictive CSP, and no injected analytics
- no application or update-endpoint cookies; `/ptracker/version.json` must work without authentication

The production build runs the network audit automatically. Post-deploy acceptance should confirm that a cached launch makes no application request when the 24-hour check is not due, while a due or explicit manual check requests only `/ptracker/version.json`.
