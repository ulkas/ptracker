# Architecture

PTracker is a client-only React/TypeScript application built by Vite into static files. The browser downloads the application shell over HTTPS. A handwritten service worker caches that shell, while Dexie stores canonical records in IndexedDB. No poker data is transmitted.

The UI reads raw entities through a small data layer and derives totals using pure domain functions. Native SVG renders charts without a runtime chart dependency. The equity calculator runs computation locally and can move Monte Carlo work to a Web Worker as workloads grow.

Updates and data are independent. Each release has a versioned application cache and a version-specific wrapper around the immutable service-worker protocol. Navigation is cache-first, so deploying new static files does not replace an installed release. A daily metadata check may display an update dot, but it does not download assets or register a worker.

The user starts preparation from Settings. The active worker validates a release manifest and fills a separate cache while the current cache remains usable. PTracker registers the target worker only when the user selects Restart and update, then explicitly activates it and reloads once. The previous cache is retained until the new application opens Dexie, completes migrations, and confirms startup. Dexie migrations are additive and never clear IndexedDB.

Device-specific update state is stored in the `appMetadata` table and is deliberately excluded from poker backups. Backup restore replaces only the documented poker-data tables.

The production artifact is `dist/`, suitable for any HTTPS static host. `docker-compose.production.yml` is an optional app-scoped Nginx container for the shared VPS; it serves only compiled files and has no host port or application backend.
