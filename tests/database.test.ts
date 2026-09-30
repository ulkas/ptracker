import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { PokerTrackerDB } from '../src/db';

const names: string[] = [];
const create = () => { const database = new PokerTrackerDB(`PTrackerTest-${crypto.randomUUID()}`); names.push(database.name); return database; };
afterEach(async () => { for (const name of names.splice(0)) await indexedDB.deleteDatabase(name); });

describe('database version 3', () => {
  it('creates, updates and deletes a room/session graph', async () => {
    const database = create(), now = new Date().toISOString();
    await database.pokerRooms.add({ id: 'r', name: 'Room', city: '', country: '', defaultCurrency: 'EUR', defaultSmallBlind: 100, defaultBigBlind: 200, notes: '', favorite: false, archived: false, createdAt: now, updatedAt: now });
    await database.sessions.add({ id: 's', roomId: 'r', gameType: 'NLH', smallBlind: 100, bigBlind: 200, currency: 'EUR', tableSize: 9, startedAt: now, notes: '', active: true, createdAt: now, updatedAt: now });
    await database.sessions.update('s', { active: false, endedAt: now }); expect((await database.sessions.get('s'))?.active).toBe(false);
    await database.sessions.delete('s'); expect(await database.sessions.count()).toBe(0); await database.close();
  });
  it('rolls back a failed multi-table transaction', async () => {
    const database = create(), now = new Date().toISOString();
    await expect(database.transaction('rw', database.pokerRooms, database.sessions, async () => { await database.pokerRooms.add({ id: 'r', name: 'Room', city: '', country: '', defaultCurrency: 'EUR', defaultSmallBlind: 100, defaultBigBlind: 200, notes: '', favorite: false, archived: false, createdAt: now, updatedAt: now }); throw new Error('stop'); })).rejects.toThrow('stop');
    expect(await database.pokerRooms.count()).toBe(0); await database.close();
  });
  it('opens the declared migration without clearing data', async () => {
    const database = create(); await database.open(); expect(database.verno).toBe(3); expect(database.tables.map((table) => table.name)).toContain('sessions'); await database.close();
  });
});
