import Dexie from 'dexie';
import { db, notifyDbChanged, readAllData } from './db';
import { sessionMetrics } from './domain';
import { GAME_TYPES, normalizeBoards, validateHandShape } from './games';
import type { AppData, PokerRoom, Session } from './types';

export interface BackupEnvelope { application: 'poker-tracker'; backupVersion: 1; databaseVersion: 1 | 2 | 3 | 4 | 5; exportedAt: string; data: AppData; }
export const BACKUP_TABLES: (keyof AppData)[] = ['pokerRooms', 'sessions', 'sessionCashEvents', 'sessionBreaks', 'hands', 'allIns', 'players', 'bankrollEvents', 'settings'];

export async function createBackup(database = db): Promise<BackupEnvelope> {
  return { application: 'poker-tracker', backupVersion: 1, databaseVersion: 5, exportedAt: new Date().toISOString(), data: await readAllData(database) };
}

export function validateBackup(input: unknown): BackupEnvelope {
  if (!input || typeof input !== 'object') throw new Error('Backup must be a JSON object.');
  const value = input as Partial<BackupEnvelope>;
  if (value.application !== 'poker-tracker') throw new Error('This file is not a PTracker backup.');
  if (value.backupVersion !== 1 || ![1, 2, 3, 4, 5].includes(value.databaseVersion ?? 0)) throw new Error('Unsupported backup version.');
  if (!value.exportedAt || Number.isNaN(Date.parse(value.exportedAt))) throw new Error('Backup timestamp is invalid.');
  if (!value.data || typeof value.data !== 'object') throw new Error('Backup data is missing.');
  const ids = new Set<string>();
  for (const table of BACKUP_TABLES) {
    const rows = value.data[table];
    if (!Array.isArray(rows)) throw new Error(`Backup table ${table} is missing.`);
    for (const row of rows as unknown[]) {
      if (!row || typeof row !== 'object') throw new Error(`${table} contains an invalid record.`);
      const record = row as { id?: unknown; key?: unknown; timestamp?: unknown; currency?: unknown };
      const identity = typeof record.id === 'string' ? `${table}:${record.id}` : typeof record.key === 'string' ? `${table}:${record.key}` : '';
      if (!identity) throw new Error(`${table} contains a record without an ID.`);
      if (ids.has(identity)) throw new Error(`${table} contains a duplicate ID.`);
      ids.add(identity);
      if (typeof record.timestamp === 'string' && Number.isNaN(Date.parse(record.timestamp))) throw new Error(`${table} contains an invalid timestamp.`);
      if (record.currency !== undefined && !['EUR', 'USD', 'GBP', 'CZK', 'PLN'].includes(String(record.currency))) throw new Error(`${table} contains an unsupported currency.`);
    }
  }
  const roomIds = new Set(value.data.pokerRooms.map((room) => room.id));
  const sessionIds = new Set(value.data.sessions.map((session) => session.id));
  const validDate = (date: unknown) => typeof date === 'string' && !Number.isNaN(Date.parse(date));
  value.data.pokerRooms = value.data.pokerRooms.map((room) => ({ ...room, defaultSmallBlind: room.defaultSmallBlind ?? 100, defaultBigBlind: room.defaultBigBlind ?? 200 }));
  value.data.sessions = value.data.sessions.map((session) => ({ ...session, gameType: session.gameType ?? 'NLH' }));
  const sessionGames = new Map(value.data.sessions.map((session) => [session.id, session.gameType]));
  value.data.hands = value.data.hands.map((hand) => ({ ...hand, entryMode: hand.entryMode ?? 'detailed', gameType: hand.gameType ?? sessionGames.get(hand.sessionId ?? '') ?? 'NLH', boards: hand.boards?.length ? hand.boards : hand.board?.length ? [hand.board] : [[]] }));
  value.data.bankrollEvents = value.data.bankrollEvents.map((event) => ({ ...event, source: event.source ?? (event.sessionId ? 'session' : 'manual') }));
  if (value.data.pokerRooms.some((room) => !room.name || !validDate(room.createdAt) || !validDate(room.updatedAt))) throw new Error('A poker room has an invalid shape or timestamp.');
  if (value.data.sessions.some((session) => !validDate(session.startedAt) || (session.endedAt !== undefined && !validDate(session.endedAt)) || session.smallBlind < 0 || session.bigBlind <= 0)) throw new Error('A session has an invalid shape, timestamp, or stakes.');
  if (value.data.sessions.some((session) => !GAME_TYPES.includes(session.gameType!))) throw new Error('A session contains an unsupported game.');
  if (value.data.hands.some((hand) => !GAME_TYPES.includes(hand.gameType!) || (() => { try { validateHandShape(hand.gameType!, hand.heroCards, normalizeBoards(hand)); return false; } catch { return true; } })())) throw new Error('A hand contains invalid cards, boards, or game data.');
  if (value.data.sessions.some((session) => !roomIds.has(session.roomId))) throw new Error('A session references a missing poker room.');
  if (value.data.sessionCashEvents.some((event) => event.type !== 'EXPENSE' && (!event.sessionId || !sessionIds.has(event.sessionId)))) throw new Error('A cash event references a missing session.');
  if (value.data.sessionCashEvents.some((event) => event.sessionId && !sessionIds.has(event.sessionId))) throw new Error('An expense references a missing session.');
  if (value.data.sessionBreaks.some((item) => !sessionIds.has(item.sessionId))) throw new Error('A break references a missing session.');
  if (value.data.hands.some((hand) => hand.sessionId !== undefined && !sessionIds.has(hand.sessionId))) throw new Error('A hand references a missing session.');
  if (value.data.allIns.some((item) => !sessionIds.has(item.sessionId))) throw new Error('An all-in references a missing session.');
  return value as BackupEnvelope;
}

export async function restoreBackup(backup: BackupEnvelope, database = db) {
  validateBackup(backup);
  const tables = BACKUP_TABLES.map((name) => database.table(name));
  await database.transaction('rw', tables, async () => {
    for (const table of tables) await table.clear();
    for (const name of BACKUP_TABLES) await (database.table(name) as Dexie.Table<Record<string, unknown>, string>).bulkAdd(backup.data[name] as unknown as Record<string, unknown>[]);
  });
  notifyDbChanged();
}

export function sessionsCsv(sessions: Session[], rooms: PokerRoom[], events: AppData['sessionCashEvents'], breaks: AppData['sessionBreaks']) {
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const header = ['date', 'room', 'stakes', 'game', 'start', 'end', 'duration_hours', 'total_in', 'cash_out', 'gross_result', 'table_tips', 'end_tips', 'expenses', 'net_result', 'hourly', 'bb_per_hour', 'notes'];
  const rows = sessions.map((session) => {
    const metric = sessionMetrics(session, events, breaks);
    const room = rooms.find((item) => item.id === session.roomId);
    return [session.startedAt.slice(0, 10), room?.name ?? '', `${session.smallBlind / 100}/${session.bigBlind / 100} ${session.currency}`, session.gameType, session.startedAt, session.endedAt ?? '', (metric.durationMs / 3_600_000).toFixed(2), metric.totalIn / 100, metric.cashOut / 100, metric.grossResult / 100, metric.tableTips / 100, metric.endTips / 100, metric.expenses / 100, metric.netResult / 100, metric.netHourly / 100, metric.bbPerHour, session.notes].map(escape).join(',');
  });
  return [header.join(','), ...rows].join('\r\n');
}

export function downloadFile(content: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
