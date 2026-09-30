# Backup format

Full backups are UTF-8 JSON named `poker-tracker-backup-YYYY-MM-DD.json`.

```json
{
  "application": "poker-tracker",
  "backupVersion": 1,
  "databaseVersion": 4,
  "exportedAt": "2026-09-30T12:00:00.000Z",
  "data": {
    "pokerRooms": [],
    "sessions": [],
    "sessionCashEvents": [],
    "sessionBreaks": [],
    "hands": [],
    "allIns": [],
    "players": [],
    "bankrollEvents": [],
    "settings": []
  }
}
```

Import parses and validates the envelope, supported versions, table arrays, IDs, timestamps, currencies, duplicates, and foreign-key relationships. The UI previews record counts and requires confirmation. Replacement occurs in one Dexie transaction, so validation or write failure leaves the existing database unchanged. JSON is authoritative; sessions CSV is an analysis export only.

The device-specific `appMetadata` table is intentionally not part of the backup envelope. Restoring a backup replaces only the tables shown above and retains the device's current update state.
