import type { AllIn, FilterModel, Hand, LiveSessionMetrics, PokerRoom, Session, SessionBreak, SessionCashEvent, SessionMetrics } from './types';

export const APP_DATA_LIMIT_BYTES = 5 * 1024 * 1024;
export const money = (minor: number, currency = 'EUR', sign = false) => new Intl.NumberFormat(undefined, {
  style: 'currency', currency, signDisplay: sign ? 'exceptZero' : 'auto', maximumFractionDigits: 2,
}).format(minor / 100);

export const parseMoney = (value: string) => Math.round((Number(value.replace(',', '.')) || 0) * 100);

export function sessionMetrics(session: Session, events: SessionCashEvent[], breaks: SessionBreak[] = [], now = Date.now()): SessionMetrics {
  const own = events.filter((event) => event.sessionId === session.id);
  const sum = (types: string[]) => own.filter((event) => types.includes(event.type)).reduce((total, event) => total + event.amount, 0);
  const totalIn = sum(['INITIAL_BUYIN', 'REBUY', 'ADDON']);
  const cashOut = sum(['CASHOUT']);
  const tableTips = sum(['TIP_TABLE']);
  const endTips = sum(['TIP_END']);
  const expenses = sum(['EXPENSE']);
  const adjustments = own.filter((event) => event.type === 'ADJUSTMENT').reduce((total, event) => total + event.amount, 0);
  const grossResult = cashOut - totalIn + adjustments;
  const netResult = grossResult - tableTips - endTips - expenses;
  const end = session.endedAt ? Date.parse(session.endedAt) : now;
  const breakMs = breaks.filter((item) => item.sessionId === session.id).reduce((total, item) => total + Math.max(0, (item.endedAt ? Date.parse(item.endedAt) : now) - Date.parse(item.startedAt)), 0);
  const durationMs = Math.max(0, end - Date.parse(session.startedAt) - breakMs);
  const hours = durationMs / 3_600_000;
  return {
    totalIn, cashOut, tableTips, endTips, expenses, grossResult, netResult, durationMs,
    grossHourly: hours ? grossResult / hours : 0,
    netHourly: hours ? netResult / hours : 0,
    bbPerHour: hours && session.bigBlind ? (netResult / session.bigBlind) / hours : 0,
  };
}

export function liveSessionMetrics(session: Session, events: SessionCashEvent[], hands: Hand[], breaks: SessionBreak[] = [], now = Date.now()): LiveSessionMetrics {
  const base = sessionMetrics(session, events, breaks, now);
  const recordedPokerResult = hands.filter((hand) => hand.sessionId === session.id).reduce((sum, hand) => sum + hand.result, 0);
  const adjustments = events.filter((event) => event.sessionId === session.id && event.type === 'ADJUSTMENT').reduce((sum, event) => sum + event.amount, 0);
  const trackedStack = Math.max(0, base.totalIn + recordedPokerResult + adjustments - base.tableTips);
  const liveNetResult = recordedPokerResult + adjustments - base.tableTips - base.endTips - base.expenses;
  const hours = base.durationMs / 3_600_000;
  return {
    ...base,
    recordedPokerResult,
    trackedStack,
    trackedStackBb: session.bigBlind ? trackedStack / session.bigBlind : 0,
    liveNetResult,
    netResult: liveNetResult,
    grossResult: recordedPokerResult,
    netHourly: hours ? liveNetResult / hours : 0,
    grossHourly: hours ? recordedPokerResult / hours : 0,
    bbPerHour: hours && session.bigBlind ? (liveNetResult / session.bigBlind) / hours : 0,
  };
}

export const durationLabel = (ms: number) => `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;

export function filterSessions(sessions: Session[], rooms: PokerRoom[], events: SessionCashEvent[], breaks: SessionBreak[], filter: FilterModel) {
  const now = new Date();
  const from = new Date(now);
  if (filter.period === 'week') from.setDate(now.getDate() - 7);
  if (filter.period === 'month') from.setMonth(now.getMonth() - 1);
  if (filter.period === 'year') from.setFullYear(now.getFullYear() - 1);
  return sessions.filter((session) => {
    const metrics = sessionMetrics(session, events, breaks);
    const room = rooms.find((item) => item.id === session.roomId);
    const inPeriod = filter.period === 'all' || Date.parse(session.startedAt) >= from.getTime();
    const query = filter.query.trim().toLowerCase();
    return inPeriod && (!filter.roomId || session.roomId === filter.roomId)
      && (!query || `${room?.name ?? ''} ${session.notes}`.toLowerCase().includes(query))
      && (filter.result === 'all' || (filter.result === 'winning' ? metrics.netResult >= 0 : metrics.netResult < 0));
  });
}

export function aggregate(sessions: Session[], events: SessionCashEvent[], breaks: SessionBreak[], allIns: AllIn[] = []) {
  const metrics = sessions.map((session) => sessionMetrics(session, events, breaks));
  const net = metrics.reduce((sum, item) => sum + item.netResult, 0);
  const gross = metrics.reduce((sum, item) => sum + item.grossResult, 0);
  const durationMs = metrics.reduce((sum, item) => sum + item.durationMs, 0);
  const hours = durationMs / 3_600_000;
  const weightedBbs = sessions.reduce((sum, session, index) => sum + (session.bigBlind ? (metrics[index]?.netResult ?? 0) / session.bigBlind : 0), 0);
  const ownIds = new Set(sessions.map((item) => item.id));
  const relevantAllIns = allIns.filter((item) => ownIds.has(item.sessionId));
  const actual = relevantAllIns.reduce((sum, item) => sum + item.actualPayout - item.heroContribution, 0);
  const ev = relevantAllIns.reduce((sum, item) => sum + item.expectedPayout - item.heroContribution, 0);
  return {
    net, gross, durationMs, hours, sessions: sessions.length, hourly: hours ? net / hours : 0,
    bbPerHour: hours ? weightedBbs / hours : 0,
    wins: metrics.filter((item) => item.netResult > 0).length,
    tips: metrics.reduce((sum, item) => sum + item.tableTips + item.endTips, 0),
    expenses: metrics.reduce((sum, item) => sum + item.expenses, 0), actual, ev, difference: actual - ev,
  };
}

export function allInMath(eligiblePot: number, heroContribution: number, equity: number, actualPayout: number) {
  const expectedPayout = Math.round(eligiblePot * equity);
  return { expectedPayout, expectedResult: expectedPayout - heroContribution, actualResult: actualPayout - heroContribution, difference: actualPayout - expectedPayout };
}

export function potOdds(currentPot: number, opponentBet: number, amountToCall: number, equity: number) {
  const finalPot = currentPot + opponentBet + amountToCall;
  const requiredEquity = finalPot ? amountToCall / finalPot : 0;
  const callEV = equity * (currentPot + opponentBet) - (1 - equity) * amountToCall;
  return { requiredEquity, callEV };
}

export const utf8Size = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
export const quotaLevel = (bytes: number, limit = APP_DATA_LIMIT_BYTES) => bytes >= limit ? 'blocked' : bytes >= limit * .9 ? 'strong' : bytes >= limit * .8 ? 'warning' : 'normal';
