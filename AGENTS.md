# PTracker Agent Instructions

- PTracker is a static, offline-first React PWA. Never introduce a production application server or remote dependency for core behavior.
- IndexedDB through Dexie is authoritative. Store money in integer minor units and timestamps as ISO-8601 strings.
- Preserve user history across upgrades with additive Dexie migrations. Never solve schema changes by deleting the database.
- Keep runtime dependencies minimal and bundled. Do not use CDNs, analytics, trackers, remote fonts, or remote APIs.
- Before meaningful changes, read `README.md` and the relevant files under `docs/`.
- Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` after significant changes.
- Deployment is static-file only. Do not deploy unless explicitly requested. Follow `docs/deployment-agent.md` and use `scripts/deploy.ps1`.
