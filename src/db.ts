import Dexie, { type EntityTable } from 'dexie';
import type { AllIn, AppMetadata, BankrollEvent, Hand, Player, PokerRoom, Session, SessionBreak, SessionCashEvent, Setting } from './types';

export class PokerTrackerDB extends Dexie {
  pokerRooms!: EntityTable<PokerRoom, 'id'>;
  sessions!: EntityTable<Session, 'id'>;
  sessionCashEvents!: EntityTable<SessionCashEvent, 'id'>;
  sessionBreaks!: EntityTable<SessionBreak, 'id'>;
  hands!: EntityTable<Hand, 'id'>;
  allIns!: EntityTable<AllIn, 'id'>;
  players!: EntityTable<Player, 'id'>;
  bankrollEvents!: EntityTable<BankrollEvent, 'id'>;
  settings!: EntityTable<Setting, 'key'>;
  appMetadata!: EntityTable<AppMetadata, 'key'>;

  constructor(name = 'PokerTrackerDB') {
    super(name);
    this.version(1).stores({
      pokerRooms: 'id, name, favorite, archived, updatedAt',
      sessions: 'id, roomId, startedAt, endedAt, active, [roomId+startedAt]',
      sessionCashEvents: 'id, sessionId, timestamp, type, [sessionId+timestamp]',
      sessionBreaks: 'id, sessionId, startedAt, endedAt',
      hands: 'id, sessionId, timestamp, heroPosition, *tags',
      allIns: 'id, sessionId, handId, timestamp',
      players: 'id, nickname, lastSeen, *tags, *roomIds',
      bankrollEvents: 'id, timestamp, type, currency',
      settings: 'key',
    });
    this.version(2).stores({
      pokerRooms: 'id, name, favorite, archived, updatedAt',
      sessions: 'id, roomId, startedAt, endedAt, active, [roomId+startedAt]',
      sessionCashEvents: 'id, sessionId, timestamp, type, [sessionId+timestamp]',
      sessionBreaks: 'id, sessionId, startedAt, endedAt',
      hands: 'id, sessionId, timestamp, heroPosition, entryMode, *tags',
      allIns: 'id, sessionId, handId, timestamp',
      players: 'id, nickname, lastSeen, *tags, *roomIds',
      bankrollEvents: 'id, timestamp, type, currency, sessionId',
      settings: 'key',
    }).upgrade(async (tx) => {
      await tx.table('pokerRooms').toCollection().modify((room) => { room.defaultSmallBlind ??= 100; room.defaultBigBlind ??= 200; });
      await tx.table('hands').toCollection().modify((hand) => { hand.entryMode ??= 'detailed'; });
      await tx.table('bankrollEvents').toCollection().modify((event) => { event.source ??= event.sessionId ? 'session' : 'manual'; });
    });
    this.version(3).stores({
      pokerRooms: 'id, name, favorite, archived, updatedAt',
      sessions: 'id, roomId, startedAt, endedAt, active, [roomId+startedAt]',
      sessionCashEvents: 'id, sessionId, timestamp, type, [sessionId+timestamp]',
      sessionBreaks: 'id, sessionId, startedAt, endedAt',
      hands: 'id, sessionId, timestamp, heroPosition, entryMode, *tags',
      allIns: 'id, sessionId, handId, timestamp',
      players: 'id, nickname, lastSeen, *tags, *roomIds',
      bankrollEvents: 'id, timestamp, type, currency, sessionId, expenseId',
      settings: 'key',
    });
    this.version(4).stores({
      pokerRooms: 'id, name, favorite, archived, updatedAt',
      sessions: 'id, roomId, startedAt, endedAt, active, [roomId+startedAt]',
      sessionCashEvents: 'id, sessionId, timestamp, type, [sessionId+timestamp]',
      sessionBreaks: 'id, sessionId, startedAt, endedAt',
      hands: 'id, sessionId, timestamp, heroPosition, entryMode, *tags',
      allIns: 'id, sessionId, handId, timestamp',
      players: 'id, nickname, lastSeen, *tags, *roomIds',
      bankrollEvents: 'id, timestamp, type, currency, sessionId, expenseId',
      settings: 'key',
      appMetadata: 'key',
    });
  }
}

export const db = new PokerTrackerDB();
export const makeId = () => crypto.randomUUID();
export const notifyDbChanged = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event('ptracker:db-change')); };

export async function readAllData(database = db) {
  const [pokerRooms, sessions, sessionCashEvents, sessionBreaks, hands, allIns, players, bankrollEvents, settings] = await Promise.all([
    database.pokerRooms.toArray(), database.sessions.toArray(), database.sessionCashEvents.toArray(), database.sessionBreaks.toArray(),
    database.hands.toArray(), database.allIns.toArray(), database.players.toArray(), database.bankrollEvents.toArray(), database.settings.toArray(),
  ]);
  return { pokerRooms, sessions, sessionCashEvents, sessionBreaks, hands, allIns, players, bankrollEvents, settings };
}
