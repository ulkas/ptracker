# Architecture

PTracker is a client-only React/TypeScript application built by Vite into static files. The browser downloads the application shell over HTTPS. A handwritten service worker caches that shell, while Dexie stores canonical records in IndexedDB. No poker data is transmitted.

The UI reads raw entities through a small data layer and derives totals using pure domain functions. Native SVG renders charts without a runtime chart dependency. The equity calculator runs computation locally and can move Monte Carlo work to a Web Worker as workloads grow.

Updates and data are independent: the service worker may replace cached application assets, but database migrations are additive and never clear IndexedDB. A waiting worker is activated only after the user chooses Update, avoiding surprise reloads during live sessions.

The production artifact is `dist/`, suitable for any HTTPS static host. `docker-compose.production.yml` is an optional app-scoped Nginx container for the shared VPS; it serves only compiled files and has no host port or application backend.
