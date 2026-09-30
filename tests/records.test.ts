import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db';
import { deleteSession, ensureDatabaseState, expenseBankrollId, syncExpenseBankroll, syncSessionBankroll } from '../src/records';

const now = '2026-09-30T20:00:00.000Z';
beforeEach(async () => { db.close(); await db.delete(); await db.open(); });
afterEach(async () => { db.close(); await db.delete(); });

describe('record lifecycle', () => {
  it('seeds the generic 1/2 room only once', async () => {
    await ensureDatabaseState();
    const room = await db.pokerRooms.toCollection().first();
    expect(room?.name).toBe('General / Unspecified');
    expect([room?.defaultSmallBlind, room?.defaultBigBlind]).toEqual([100, 200]);
    await db.pokerRooms.clear(); await ensureDatabaseState();
    expect(await db.pokerRooms.count()).toBe(0);
  });

  it('synchronizes net session result into bankroll and cascades deletion', async () => {
    await db.pokerRooms.add({ id: 'r', name: 'Room', city: '', country: '', defaultCurrency: 'EUR', defaultSmallBlind: 100, defaultBigBlind: 200, notes: '', favorite: false, archived: false, createdAt: now, updatedAt: now });
    await db.sessions.add({ id: 's', roomId: 'r', gameType: 'NLH', smallBlind: 100, bigBlind: 200, currency: 'EUR', tableSize: 9, startedAt: '2026-09-30T18:00:00.000Z', endedAt: now, notes: '', active: false, createdAt: now, updatedAt: now });
    await db.sessionCashEvents.bulkAdd([
      { id: 'in', sessionId: 's', timestamp: now, type: 'INITIAL_BUYIN', amount: 10_000, note: '', currency: 'EUR' },
      { id: 'out', sessionId: 's', timestamp: now, type: 'CASHOUT', amount: 15_000, note: '', currency: 'EUR' },
      { id: 'tip', sessionId: 's', timestamp: now, type: 'TIP_TABLE', amount: 500, note: '', currency: 'EUR' },
      { id: 'expense', sessionId: 's', timestamp: now, type: 'EXPENSE', amount: 1_000, note: 'Parking', currency: 'EUR' },
    ]);
    await syncSessionBankroll('s');
    expect((await db.bankrollEvents.where('sessionId').equals('s').first())?.amount).toBe(3_500);
    await deleteSession('s');
    expect(await db.sessions.count()).toBe(0); expect(await db.sessionCashEvents.count()).toBe(0); expect(await db.bankrollEvents.count()).toBe(0);
  });

  it('tracks standalone expenses in bankroll without double-counting session expenses', async () => {
    await db.sessionCashEvents.add({ id: 'standalone', timestamp: now, type: 'EXPENSE', amount: 100, note: 'Drinks', currency: 'EUR' });
    await syncExpenseBankroll('standalone');
    expect(await db.bankrollEvents.get(expenseBankrollId('standalone'))).toMatchObject({ amount: -100, source: 'expense', expenseId: 'standalone' });

    await db.sessionCashEvents.update('standalone', { amount: 200 });
    await syncExpenseBankroll('standalone');
    expect((await db.bankrollEvents.get(expenseBankrollId('standalone')))?.amount).toBe(-200);

    await db.sessionCashEvents.update('standalone', { sessionId: 'some-session' });
    await syncExpenseBankroll('standalone');
    expect(await db.bankrollEvents.get(expenseBankrollId('standalone'))).toBeUndefined();
  });

  it('backfills existing standalone expenses when database state is loaded', async () => {
    await db.sessionCashEvents.add({ id: 'existing', timestamp: now, type: 'EXPENSE', amount: 100, note: 'Drinks', currency: 'EUR' });
    await ensureDatabaseState();
    expect((await db.bankrollEvents.get(expenseBankrollId('existing')))?.amount).toBe(-100);
  });
});
