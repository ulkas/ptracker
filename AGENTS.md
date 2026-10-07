# PTracker Agent Instructions

- PTracker is a static, offline-first React PWA. Never introduce a production application server or remote dependency for core behavior.
- IndexedDB through Dexie is authoritative. Store money in integer minor units and timestamps as ISO-8601 strings.
- Preserve user history across upgrades with additive Dexie migrations. Never solve schema changes by deleting the database.
- Keep runtime dependencies minimal and bundled. Do not use CDNs, analytics, trackers, remote fonts, or remote APIs.
- Before meaningful changes, read `README.md` and the relevant files under `docs/`.
- Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` after significant changes.
- Deployment is static-file only. Do not deploy unless explicitly requested. Follow `docs/deployment-agent.md` and use `scripts/deploy.ps1`.
- `public/service-worker-protocol-v1.js` is immutable after the first production release. Add a new protocol file for incompatible changes; never silently change an installed protocol.
- Every production release must use a new semantic version in `package.json` and synchronized release information in `release.json`. Do not reuse a version number for different assets.
- When the user asks to commit and deploy, automatically prepare a new semantic release version before building: increment the patch version unless a different version is explicitly requested, update `release.json` release metadata/notes, verify the generated `version.json` and versioned service worker, then commit, push, and deploy the new version.
- When the user asks to commit and deploy, automatically prepare a new semantic release version before building: increment the patch version unless a different version is explicitly requested, update `release.json` release metadata/notes, verify the generated `version.json` and versioned service worker, then commit, push, and deploy the new version.
