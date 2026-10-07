import { sessionMetrics } from './domain';
import type { PokerRoom, Session, SessionBreak, SessionCashEvent } from './types';

export interface CumulativePoint { timestamp: string; value: number }

export function cumulativeChanges<T>(rows: T[], timestamp: (row: T) => string, amount: (row: T) => number): CumulativePoint[] {
  let total = 0;
  return [...rows]
    .sort((a, b) => Date.parse(timestamp(a)) - Date.parse(timestamp(b)))
    .map((row) => ({ timestamp: timestamp(row), value: total += amount(row) }));
}

export interface RoomPerformance {
  room: PokerRoom;
  sessions: number;
  hours: number;
  net: number;
}

export function roomPerformance(rooms: PokerRoom[], sessions: Session[], events: SessionCashEvent[], breaks: SessionBreak[]): RoomPerformance[] {
  return rooms.map((room) => {
    const completed = sessions.filter((session) => session.roomId === room.id && !session.active && Boolean(session.endedAt));
    const metrics = completed.map((session) => sessionMetrics(session, events, breaks));
    return {
      room,
      sessions: completed.length,
      hours: metrics.reduce((sum, item) => sum + item.durationMs, 0) / 3_600_000,
      net: metrics.reduce((sum, item) => sum + item.netResult, 0),
    };
  }).sort((a, b) => b.sessions - a.sessions || b.hours - a.hours || a.room.name.localeCompare(b.room.name));
}

export interface CalendarDay {
  day: number;
  net: number;
  sessions: number;
}

export function sessionCalendar(year: number, month: number, sessions: Session[], events: SessionCashEvent[], breaks: SessionBreak[]): { offset: number; days: CalendarDay[] } {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const offset = new Date(year, month, 1).getDay();
  const days = Array.from({ length: lastDay }, (_, index) => ({ day: index + 1, net: 0, sessions: 0 }));
  for (const session of sessions) {
    if (session.active || !session.endedAt) continue;
    const date = new Date(session.startedAt);
    if (date.getFullYear() !== year || date.getMonth() !== month) continue;
    const day = days[date.getDate() - 1];
    if (!day) continue;
    day.sessions += 1;
    day.net += sessionMetrics(session, events, breaks).netResult;
  }
  return { offset, days };
}

export interface TipCalendarDay { date: string; day: number; amount: number; }

export function rollingTipsCalendar(events: SessionCashEvent[], currency: string, currencyOf: (event: SessionCashEvent) => string = (event) => event.currency ?? '', now = new Date()): { days: TipCalendarDay[]; total: number } {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (29 - index));
    return { date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`, day: date.getDate(), amount: 0 };
  });
  const byDate = new Map(days.map(day => [day.date, day]));
  for (const event of events) {
    if (event.type !== 'TIP_TABLE' && event.type !== 'TIP_END') continue;
    if (currencyOf(event) !== currency) continue;
    const date = new Date(event.timestamp);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const day = byDate.get(key);
    if (day) day.amount += event.amount;
  }
  return { days, total: days.reduce((sum, day) => sum + day.amount, 0) };
}
