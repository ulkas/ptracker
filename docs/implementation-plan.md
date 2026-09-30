# Implementation plan

1. Foundation: Vite/React/TypeScript, responsive design tokens, manifest, icons, service worker and update prompt.
2. Data/domain: Dexie schema, typed entities, pure money/session/statistics functions, storage quota and persistent-storage request.
3. Core tracker: rooms, session setup, live event timeline, break timer, cash-out, session history/detail, dashboard and native SVG P/L chart.
4. Portability: validated transactional JSON backup/restore, CSV export, storage diagnostics.
5. Poker records: compact hand recorder, all-in records/EV, player records and searchable tags.
6. Tools: exact/Monte Carlo Hold'em equity, duplicate-card validation, ranges, pot odds and bankroll ledger.
7. Verification: domain/database/backup/equity tests, offline build inspection, accessibility and 360 px responsive QA.
8. Operations: static Nginx image, app-scoped Compose file, direct-SSH PowerShell deployment driver and runbook. Deployment remains manual and is not performed during project creation.
