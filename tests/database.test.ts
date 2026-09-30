import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { PokerTrackerDB } from '../src/db';

const names: string[] = [];
const create = () => { const database = new PokerTrackerDB(`PTrackerTest-${crypto.randomUUID()}`); names.push(database.name); return database; };
afterEach(async () => { for (const name of names.splice(0)) await indexedDB.deleteDatabase(name); });

describe('database version 4', () => {
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
    const database = create(); await database.open(); expect(database.verno).toBe(4); expect(database.tables.map((table) => table.name)).toContain('appMetadata'); await database.close();
  });
  it('migrates a populated v3 database without losing poker or active-session data', async () => {
    const name = `PTrackerTest-${crypto.randomUUID()}`; names.push(name);
    const legacy = new Dexie(name);
    legacy.version(3).stores({ pokerRooms: 'id, name, favorite, archived, updatedAt', sessions: 'id, roomId, startedAt, endedAt, active, [roomId+startedAt]', sessionCashEvents: 'id, sessionId, timestamp, type, [sessionId+timestamp]', sessionBreaks: 'id, sessionId, startedAt, endedAt', hands: 'id, sessionId, timestamp, heroPosition, entryMode, *tags', allIns: 'id, sessionId, handId, timestamp', players: 'id, nickname, lastSeen, *tags, *roomIds', bankrollEvents: 'id, timestamp, type, currency, sessionId, expenseId', settings: 'key' });
    const now = new Date().toISOString();
    await legacy.open();
    await legacy.table('pokerRooms').add({ id: 'r', name: 'Room', city: '', country: '', defaultCurrency: 'EUR', defaultSmallBlind: 100, defaultBigBlind: 200, notes: '', favorite: true, archived: false, createdAt: now, updatedAt: now });
    await legacy.table('sessions').bulkAdd(Array.from({ length: 1000 }, (_, index) => ({ id: `s${index}`, roomId: 'r', gameType: 'NLH', smallBlind: 100, bigBlind: 200, currency: 'EUR', tableSize: 9, startedAt: now, endedAt: index ? now : undefined, notes: '', active: index === 0, createdAt: now, updatedAt: now })));
    await legacy.table('hands').add({ id: 'h', sessionId: 's1', timestamp: now, tableSize: 9, smallBlind: 100, bigBlind: 200, currency: 'EUR', effectiveStack: 20000, heroPosition: 'BTN', heroCards: ['As', 'Kh'], board: [], entryMode: 'detailed', result: 1000, notes: '', tags: [], actions: [] });
    await legacy.table('allIns').add({ id: 'a', sessionId: 's1', timestamp: now, street: 'FLOP', heroCards: [], villainCardsOrRange: '', boardAtAllIn: [], potBeforeAllIn: 1000, heroContribution: 1000, villainContribution: 1000, heroEquity: .5, expectedPayout: 1000, actualPayout: 2000 });
    await legacy.table('bankrollEvents').add({ id: 'b', timestamp: now, type: 'POKER_RESULT', amount: 1000, currency: 'EUR', note: '', source: 'session', sessionId: 's1' });
    legacy.close();
    const database = new PokerTrackerDB(name); await database.open();
    expect(database.verno).toBe(4); expect(await database.sessions.count()).toBe(1000); expect((await database.sessions.get('s0'))?.active).toBe(true); expect(await database.hands.count()).toBe(1); expect(await database.allIns.count()).toBe(1); expect(await database.bankrollEvents.count()).toBe(1); expect(await database.appMetadata.count()).toBe(0);
    database.close();
  });
});
