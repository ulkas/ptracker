import { db, makeId, notifyDbChanged } from './db';
import { sessionMetrics } from './domain';
import type { Currency, Session } from './types';

export const sessionBankrollId = (sessionId: string) => `bankroll-session-${sessionId}`;
export const expenseBankrollId = (expenseId: string) => `bankroll-expense-${expenseId}`;

export async function syncSessionBankroll(sessionId: string) {
  const session = await db.sessions.get(sessionId);
  const id = sessionBankrollId(sessionId);
  if (!session?.endedAt || session.active) { await db.bankrollEvents.delete(id); return; }
  const [events, breaks] = await Promise.all([db.sessionCashEvents.where('sessionId').equals(sessionId).toArray(), db.sessionBreaks.where('sessionId').equals(sessionId).toArray()]);
  const result = sessionMetrics(session, events, breaks).netResult;
  await db.bankrollEvents.put({ id, sessionId, source: 'session', type: 'POKER_RESULT', amount: result, currency: session.currency, timestamp: session.endedAt, note: 'Session result' });
}

export async function syncExpenseBankroll(expenseId: string) {
  const expense = await db.sessionCashEvents.get(expenseId);
  const id = expenseBankrollId(expenseId);
  if (!expense || expense.type !== 'EXPENSE' || expense.sessionId) { await db.bankrollEvents.delete(id); return; }
  await db.bankrollEvents.put({ id, expenseId, source: 'expense', type: 'WITHDRAWAL', amount: -expense.amount, currency: expense.currency ?? 'EUR', timestamp: expense.timestamp, note: expense.note || 'Expense' });
}

export async function ensureDatabaseState() {
  await db.transaction('rw', db.pokerRooms, db.settings, async () => {
    const seeded = await db.settings.get('initialRoomSeeded');
    if (!seeded) {
      if (await db.pokerRooms.count() === 0) {
        const now = new Date().toISOString();
        await db.pokerRooms.add({ id: makeId(), name: 'General / Unspecified', city: '', country: '', defaultCurrency: 'EUR', defaultSmallBlind: 100, defaultBigBlind: 200, notes: '', favorite: true, archived: false, createdAt: now, updatedAt: now });
      }
      await db.settings.put({ key: 'initialRoomSeeded', value: true });
    }
  });
  const completed = await db.sessions.filter((session) => Boolean(session.endedAt) && !session.active).toArray();
  for (const session of completed) await syncSessionBankroll(session.id);
  const standaloneExpenses = await db.sessionCashEvents.filter((event) => event.type === 'EXPENSE' && !event.sessionId).toArray();
  for (const expense of standaloneExpenses) await syncExpenseBankroll(expense.id);
}

export async function deleteSession(sessionId: string) {
  await db.transaction('rw', [db.sessions, db.sessionCashEvents, db.sessionBreaks, db.hands, db.allIns, db.bankrollEvents], async () => {
    await Promise.all([
      db.sessionCashEvents.where('sessionId').equals(sessionId).delete(), db.sessionBreaks.where('sessionId').equals(sessionId).delete(),
      db.hands.where('sessionId').equals(sessionId).delete(), db.allIns.where('sessionId').equals(sessionId).delete(),
      db.bankrollEvents.where('sessionId').equals(sessionId).delete(), db.sessions.delete(sessionId),
    ]);
  });
  notifyDbChanged();
}

export async function setBankrollBalance(currency: Currency, target: number) {
  const rows = await db.bankrollEvents.where('currency').equals(currency).toArray();
  const current = rows.reduce((sum, row) => sum + row.amount, 0);
  const difference = target - current;
  if (difference) await db.bankrollEvents.add({ id: makeId(), timestamp: new Date().toISOString(), type: 'ADJUSTMENT', amount: difference, currency, note: 'Set current balance', source: 'manual' });
  notifyDbChanged();
}

export async function saveCompletedSession(session: Session, values: { totalIn: number; cashOut: number; tableTips: number; endTips: number; expense: number; expenseNote: string }) {
  await db.transaction('rw', db.sessions, db.sessionCashEvents, db.bankrollEvents, async () => {
    await db.sessions.put(session);
    await db.sessionCashEvents.where('sessionId').equals(session.id).delete();
    const timestamp = session.endedAt ?? session.startedAt;
    const rows = [
      ['INITIAL_BUYIN', values.totalIn, ''], ['CASHOUT', values.cashOut, ''], ['TIP_TABLE', values.tableTips, ''], ['TIP_END', values.endTips, ''], ['EXPENSE', values.expense, values.expenseNote],
    ] as const;
    for (const [type, amount, note] of rows) if (amount) await db.sessionCashEvents.add({ id: makeId(), sessionId: session.id, timestamp, type, amount, note, currency: session.currency });
  });
  await syncSessionBankroll(session.id); notifyDbChanged();
}
