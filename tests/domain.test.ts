import { describe, expect, it } from 'vitest';
import { aggregate, allInMath, liveSessionMetrics, potOdds, quotaLevel, sessionMetrics, utf8Size } from '../src/domain';
import type { Hand, Session, SessionCashEvent } from '../src/types';

const session: Session = { id: 's1', roomId: 'r1', gameType: 'NLH', smallBlind: 100, bigBlind: 200, currency: 'EUR', tableSize: 9, startedAt: '2026-09-30T18:00:00.000Z', endedAt: '2026-09-30T23:30:00.000Z', notes: '', active: false, createdAt: '2026-09-30T18:00:00.000Z', updatedAt: '2026-09-30T23:30:00.000Z' };
const event = (type: SessionCashEvent['type'], amount: number): SessionCashEvent => ({ id: type + amount, sessionId: 's1', timestamp: session.startedAt, type, amount, note: '' });
const events = [event('INITIAL_BUYIN', 20_000), event('ADDON', 10_000), event('TIP_TABLE', 800), event('TIP_END', 500), event('CASHOUT', 48_700)];

describe('session finance acceptance case', () => {
  it('derives one authoritative set of results', () => {
    const value = sessionMetrics(session, events);
    expect(value.totalIn).toBe(30_000); expect(value.grossResult).toBe(18_700); expect(value.netResult).toBe(17_400);
    expect(value.tableTips + value.endTips).toBe(1_300); expect(value.durationMs).toBe(5.5 * 3_600_000);
    expect(value.grossHourly).toBeCloseTo(3_400); expect(value.netHourly).toBeCloseTo(3163.636);
  });
  it('aggregates rather than averaging rates', () => {
    const total = aggregate([session], events, []);
    expect(total.net).toBe(17_400); expect(total.hours).toBe(5.5); expect(total.hourly).toBeCloseTo(3163.636);
  });
});

describe('poker math and quota', () => {
  it('calculates all-in expected value', () => expect(allInMath(40_000, 20_000, .7, 40_000)).toEqual({ expectedPayout: 28_000, expectedResult: 8_000, actualResult: 20_000, difference: 12_000 }));
  it('calculates pot odds and call EV', () => { const value = potOdds(10_000, 5_000, 5_000, .35); expect(value.requiredEquity).toBe(.25); expect(value.callEV).toBe(2000); });
  it('uses UTF-8 byte size and thresholds', () => { expect(utf8Size('€')).toBe(5); expect(quotaLevel(80, 100)).toBe('warning'); expect(quotaLevel(90, 100)).toBe('strong'); expect(quotaLevel(100, 100)).toBe('blocked'); });
});

describe('live stack tracking', () => {
  const active = { ...session, active: true, endedAt: undefined };
  it('starts at the buy-in with zero profit', () => {
    const value = liveSessionMetrics(active, [event('INITIAL_BUYIN', 10_000)], []);
    expect(value.trackedStack).toBe(10_000); expect(value.liveNetResult).toBe(0);
  });
  it('tracks hands and tips in stack while expenses only affect net profit', () => {
    const hand = (id: string, result: number): Hand => ({ id, sessionId: 's1', timestamp: active.startedAt, tableSize: 9, smallBlind: 100, bigBlind: 200, currency: 'EUR', effectiveStack: 0, heroPosition: 'BB', heroCards: [], board: [], entryMode: 'quick', result, notes: '', tags: [], actions: [] });
    const liveEvents = [event('INITIAL_BUYIN', 10_000), event('ADDON', 5_000), event('TIP_TABLE', 500), event('EXPENSE', 1_000)];
    const value = liveSessionMetrics(active, liveEvents, [hand('h1', 8_500), hand('h2', -300)]);
    expect(value.trackedStack).toBe(22_700); expect(value.liveNetResult).toBe(6_700); expect(value.trackedStackBb).toBe(113.5);
  });
});
