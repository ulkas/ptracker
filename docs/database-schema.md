# Database schema

Database: `PokerTrackerDB`, Dexie version 5. Version 2 added room stake defaults, hand entry modes, optional standalone expenses, and session-linked bankroll events without clearing version 1 data. Version 3 indexes standalone-expense bankroll links. Version 4 adds device-local update metadata. Version 5 adds session/hand game variants and canonical multi-board storage without modifying existing results.

| Table | Primary/indexed fields | Purpose |
| --- | --- | --- |
| pokerRooms | `id`, `name`, `favorite`, `archived`, `updatedAt` | Reusable venues with default SB/BB |
| sessions | `id`, `roomId`, `gameType`, `startedAt`, `endedAt`, `active`, `[roomId+startedAt]` | Session facts and default game, never calculated P/L |
| sessionCashEvents | `id`, `sessionId`, `timestamp`, `type`, `[sessionId+timestamp]` | Buy-ins, cash-outs, tips, expenses |
| sessionBreaks | `id`, `sessionId`, `startedAt`, `endedAt` | Excluded time |
| hands | `id`, `sessionId`, `gameType`, `timestamp`, `heroPosition`, `entryMode`, `result` | Quick results and detailed hands; `boards` stores one or two board arrays |
| allIns | `id`, `sessionId`, `timestamp` | All-in expected and actual payouts |
| players | `id`, `nickname`, `lastSeen` | Opponent notes |
| bankrollEvents | `id`, `timestamp`, `type`, `currency`, `sessionId`, `expenseId` | Per-currency ledger with linked session results and standalone expenses |
| settings | `key` | Theme, headline P/L, quota and backup metadata |
| appMetadata | `key` | Device-specific update detection and preparation state; excluded from poker backups |

Money is always an integer number of minor units with an adjacent ISO-4217 currency code. IDs are UUIDs. Times are ISO-8601 strings. Session-linked expenses are already included in the completed session's net result; only standalone expenses receive their own negative bankroll event, preventing double counting. Later versions must use `db.version(n).stores(...).upgrade(...)`; tables must not be deleted as a shortcut.
