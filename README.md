# PTracker

PTracker is a private, mobile-first cash poker tracker that runs entirely in the browser. It is an installable PWA, works offline after its first complete load, and stores canonical data in IndexedDB. There is no account, backend, telemetry, or remote poker-data API. Normal use is network-silent; the only automatic application request is a metadata-only update check no more than once per rolling 24 hours.

## What is implemented

- Installable/offline production PWA with strictly manual, backup-aware version updates
- Poker rooms with default stakes, mixed-game sessions, and historical-session entry for NLH, PLO4, PLO5, and PLO4 double-board bomb pots
- Event-based buy-ins, add-ons, tips, expenses, breaks and cash-out
- Gross/net P&L, duration, hourly, BB/hour, room and filtered dashboard statistics
- Currency-safe cumulative native-SVG profit and bankroll charts
- Monthly session calendar with daily net results
- Session history and search
- Quick game-specific gain/loss tracking plus detailed NLH/PLO hands with a mobile 52-card picker and one/two boards
- Tracked live stack in currency and big blinds, with cash-out reconciliation
- Dedicated editable Rooms, Expenses, Tips, and per-currency Bankroll pages; standalone expenses automatically reduce bankroll
- Multi-player Hold'em equity calculator (exact on turn/river, Monte Carlo earlier)
- Pot odds/call EV and session-linked all-in EV records
- Transactional, validated JSON backup/restore and sessions CSV export
- Persistent-storage request, browser quota diagnostics and 5 MiB soft app quota display
- Dark/light/system themes and responsive phone/tablet/desktop layouts

Advanced action-by-action hand replay, range-grid parsing, player sample counters, and bankroll-by-room are documented future increments rather than hidden stubs.

## Develop

Requires a current Node.js LTS release and npm.

```powershell
npm install
npm run dev
```

Open <http://localhost:5173>. Service workers are registered only in production builds to prevent stale development assets.

## Verify

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run audit:network
npm run test:pwa
```

`test:pwa` uses an installed Chrome browser and the completed `dist/` build to exercise two releases end-to-end. Preview the production/offline build with `npm run preview`. In browser developer tools, verify the manifest is installable and switch the Network panel to Offline after one complete load.

To log reviewed application requests while developing, start Vite with `$env:VITE_NETWORK_AUDIT='1'; npm run dev` in PowerShell. This logs only the method, local URL, and declared reason—not poker data.

Application versions come from `package.json`. Release notes and migration flags live in `release.json`. A production build emits `version.json`, `release-manifest.json`, and a version-specific worker wrapper. The installed release remains cache-pinned until the user completes the update flow under Settings. Root CSS disables installed-PWA pull-to-refresh while preserving ordinary page, dialog, history, and navigation scrolling. Browser-managed service-worker lifecycle checks remain under browser control and are distinct from application-initiated requests.

## Deploy later

Deployment has not been run. The artifact is the static `dist/` directory and needs HTTPS for PWA installation. Copy `scripts/deploy.local.example.ps1` to the ignored `scripts/deploy.local.ps1`, fill in the VPS values, then follow [the deployment runbook](docs/deployment-agent.md). The checked-in driver performs preflight, build, a private timestamped backup, atomic static-file replacement, and HTTPS postcheck.

## Data safety

Browser storage can be cleared by the user or operating system. Persistent storage reduces eviction risk but does not replace a backup. Export JSON regularly, especially before browser/device migration.
