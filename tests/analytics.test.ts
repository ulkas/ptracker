import { describe, expect, it } from 'vitest';
import { cumulativeChanges, roomPerformance, sessionCalendar } from '../src/analytics';
import type { PokerRoom, Session, SessionCashEvent } from '../src/types';

const stamp = (day: number) => new Date(2026, 8, day, 12).toISOString();
const room = (id: string, name: string): PokerRoom => ({ id, name, city: '', country: '', defaultCurrency: 'EUR', defaultSmallBlind: 100, defaultBigBlind: 200, notes: '', favorite: false, archived: false, createdAt: stamp(1), updatedAt: stamp(1) });
const session = (id: string, roomId: string, day: number, hours = 2): Session => ({ id, roomId, gameType: 'NLH', smallBlind: 100, bigBlind: 200, currency: 'EUR', tableSize: 9, startedAt: stamp(day), endedAt: new Date(new Date(stamp(day)).getTime() + hours * 3_600_000).toISOString(), notes: '', active: false, createdAt: stamp(day), updatedAt: stamp(day) });
const result = (sessionId: string, amount: number): SessionCashEvent[] => [
  { id: `${sessionId}-in`, sessionId, timestamp: stamp(1), type: 'INITIAL_BUYIN', amount: 10_000, note: '', currency: 'EUR' },
  { id: `${sessionId}-out`, sessionId, timestamp: stamp(1), type: 'CASHOUT', amount: 10_000 + amount, note: '', currency: 'EUR' },
];

describe('visual analytics', () => {
  it('sorts cumulative changes chronologically and starts its total from zero', () => {
    const points = cumulativeChanges([{ at: stamp(3), amount: -200 }, { at: stamp(1), amount: 500 }], (row) => row.at, (row) => row.amount);
    expect(points.map((point) => point.value)).toEqual([500, 300]);
  });

  it('orders rooms by completed session count, then hours, then name', () => {
    const rooms = [room('a', 'Alpha'), room('b', 'Bravo'), room('c', 'Charlie')];
    const sessions = [session('a1', 'a', 1), session('b1', 'b', 2, 5), session('c1', 'c', 3), session('c2', 'c', 4)];
    const events = [...result('a1', 100), ...result('b1', -200), ...result('c1', 300), ...result('c2', 400)];
    const rows = roomPerformance(rooms, sessions, events, []);
    expect(rows.map((row) => row.room.id)).toEqual(['c', 'b', 'a']);
    expect(rows[0]).toMatchObject({ sessions: 2, net: 700 });
  });

  it('builds a Sunday-first month and combines sessions on the same day', () => {
    const sessions = [session('s1', 'a', 2), session('s2', 'a', 2), session('s3', 'a', 9)];
    const events = [...result('s1', 500), ...result('s2', -200), ...result('s3', -100)];
    const calendar = sessionCalendar(2026, 8, sessions, events, []);
    expect(calendar.offset).toBe(2);
    expect(calendar.days[1]).toEqual({ day: 2, sessions: 2, net: 300 });
    expect(calendar.days[8]).toEqual({ day: 9, sessions: 1, net: -100 });
  });
});
