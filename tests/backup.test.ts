import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { validateBackup, type BackupEnvelope } from '../src/backup';
import { createBackup, restoreBackup } from '../src/backup';
import { PokerTrackerDB } from '../src/db';

const emptyData: BackupEnvelope['data'] = { pokerRooms: [], sessions: [], sessionCashEvents: [], sessionBreaks: [], hands: [], allIns: [], players: [], bankrollEvents: [], settings: [] };
const envelope = (): BackupEnvelope => ({ application: 'poker-tracker', backupVersion: 1, databaseVersion: 1, exportedAt: '2026-09-30T12:00:00.000Z', data: structuredClone(emptyData) });

describe('backup validation', () => {
  it('accepts the supported empty schema', () => expect(validateBackup(envelope()).backupVersion).toBe(1));
  it('rejects another application and version', () => { expect(() => validateBackup({ ...envelope(), application: 'other' })).toThrow(/not a PTracker/); expect(() => validateBackup({ ...envelope(), backupVersion: 2 })).toThrow(/Unsupported/); });
  it('rejects broken relationships', () => { const value = envelope(); value.data.sessions.push({ id: 's', roomId: 'missing', gameType: 'NLH', smallBlind: 100, bigBlind: 200, currency: 'EUR', tableSize: 9, startedAt: value.exportedAt, notes: '', active: false, createdAt: value.exportedAt, updatedAt: value.exportedAt }); expect(() => validateBackup(value)).toThrow(/missing poker room/); });
  it('rejects duplicate table IDs', () => { const value = envelope(); const room = { id: 'r', name: 'A', city: '', country: '', defaultCurrency: 'EUR' as const, defaultSmallBlind: 100, defaultBigBlind: 200, notes: '', favorite: false, archived: false, createdAt: value.exportedAt, updatedAt: value.exportedAt }; value.data.pokerRooms.push(room, room); expect(() => validateBackup(value)).toThrow(/duplicate ID/); });
  it('normalizes and validates PLO double-board backups', () => { const value = envelope(); value.data.pokerRooms.push({ id: 'r', name: 'Room', city: '', country: '', defaultCurrency: 'EUR', defaultSmallBlind: 100, defaultBigBlind: 200, notes: '', favorite: false, archived: false, createdAt: value.exportedAt, updatedAt: value.exportedAt }); value.data.sessions.push({ id: 's', roomId: 'r', gameType: 'PLO4_DOUBLE_BOARD_BOMB_POT', smallBlind: 100, bigBlind: 200, currency: 'EUR', tableSize: 6, startedAt: value.exportedAt, notes: '', active: false, createdAt: value.exportedAt, updatedAt: value.exportedAt }); value.data.hands.push({ id: 'h', sessionId: 's', timestamp: value.exportedAt, tableSize: 6, smallBlind: 100, bigBlind: 200, currency: 'EUR', effectiveStack: 0, heroPosition: 'BTN', heroCards: ['As', 'Kh', 'Qc', 'Jd'], board: [], boards: [['2s'], ['3h']], gameType: 'PLO4_DOUBLE_BOARD_BOMB_POT', entryMode: 'quick', result: 100, notes: '', tags: [], actions: [] }); const checked = validateBackup(value); expect(checked.data.hands[0]?.gameType).toBe('PLO4_DOUBLE_BOARD_BOMB_POT'); expect(checked.data.hands[0]?.boards).toEqual([['2s'], ['3h']]); });
  it('excludes and preserves device-specific update metadata', async () => {
    const database = new PokerTrackerDB(`PTrackerBackup-${crypto.randomUUID()}`), now = new Date().toISOString();
    await database.open();
    await database.appMetadata.put({ key: 'update', value: { availableVersion: '9.0.0' } });
    await database.pokerRooms.add({ id: 'r', name: 'Room', city: '', country: '', defaultCurrency: 'EUR', defaultSmallBlind: 100, defaultBigBlind: 200, notes: '', favorite: false, archived: false, createdAt: now, updatedAt: now });
    const backup = await createBackup(database);
    expect('appMetadata' in backup.data).toBe(false);
    await database.pokerRooms.clear(); await restoreBackup(backup, database);
    expect(await database.pokerRooms.count()).toBe(1); expect((await database.appMetadata.get('update'))?.value).toEqual({ availableVersion: '9.0.0' });
    database.close(); await database.delete();
  });
});
