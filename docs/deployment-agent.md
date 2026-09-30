# PTracker VPS deployment runbook

PTracker deploys as static files only. It does not run Node.js, a database, Compose, or an application container in production. The existing HTTPS reverse proxy/static server must own the hostname and serve the configured web root with SPA fallback to `index.html`.

## One-time configuration

1. Copy `scripts/deploy.local.example.ps1` to ignored `scripts/deploy.local.ps1`.
2. Set the SSH target, private-key path, app root, and public HTTPS URL. Never commit this file.
3. Provision the hostname and TLS certificate in the shared proxy. A minimal Nginx location example is in `deploy/nginx-ptracker.conf.example`; integrate it deliberately rather than replacing shared proxy configuration.
4. Ensure the SSH user can write only the configured PTracker application directory.

## Routine deployment

```powershell
.\scripts\deploy.ps1 remote-preflight
.\scripts\deploy.ps1 deploy
.\scripts\deploy.ps1 postcheck
```

`deploy` runs all local verification, builds `dist/`, creates a source manifest, uploads one archive, backs up the current static release remotely, extracts to a new release directory, and atomically switches the `current` symlink. Backups and releases remain beneath the configured PTracker app root. It does not touch the shared proxy or other applications.

## Rollback

Rollback is intentionally not automatic. On a failed postcheck the prior `current` target remains named in the deployment output. Switching to it is a production mutation and should be performed only after explicit approval and inspection.

## Static host requirements

- HTTPS and correct MIME types for `.webmanifest`, JavaScript, CSS, SVG, and PNG
- `/service-worker.js` served from origin root with `Cache-Control: no-cache`
- hashed `/assets/` served with long immutable caching
- unknown navigation paths fall back to `/index.html`
- `X-Content-Type-Options: nosniff`, a restrictive CSP, and no injected analytics
