export type Currency = 'EUR' | 'USD' | 'GBP' | 'CZK' | 'PLN';
export type CashEventType = 'INITIAL_BUYIN' | 'REBUY' | 'ADDON' | 'CASHOUT' | 'TIP_TABLE' | 'TIP_END' | 'EXPENSE' | 'ADJUSTMENT';
export type GameType = 'NLH';
export type Theme = 'system' | 'dark' | 'light';

export interface PokerRoom {
  id: string; name: string; city: string; country: string; defaultCurrency: Currency;
  defaultSmallBlind: number; defaultBigBlind: number; notes: string; favorite: boolean; archived: boolean; createdAt: string; updatedAt: string;
}

export interface Session {
  id: string; roomId: string; gameType: GameType; smallBlind: number; bigBlind: number;
  optionalStraddle?: number; currency: Currency; tableSize: number; startedAt: string;
  endedAt?: string; notes: string; active: boolean; createdAt: string; updatedAt: string;
}

export interface SessionCashEvent {
  id: string; sessionId?: string; timestamp: string; type: CashEventType; amount: number; note: string; currency?: Currency;
}

export interface SessionBreak {
  id: string; sessionId: string; startedAt: string; endedAt?: string;
}

export interface HandAction { player: string; street: 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN'; action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in'; amount?: number; sequence: number; }
export interface Hand {
  id: string; sessionId?: string; timestamp: string; tableSize: number; smallBlind: number; bigBlind: number;
  currency: Currency; effectiveStack: number; heroPosition: string; heroCards: string[]; board: string[];
  entryMode: 'quick' | 'detailed'; result: number; notes: string; tags: string[]; actions: HandAction[];
}

export interface AllIn {
  id: string; sessionId: string; handId?: string; timestamp: string; street: string; heroCards: string[];
  villainCardsOrRange: string; boardAtAllIn: string[]; potBeforeAllIn: number; heroContribution: number;
  villainContribution: number; heroEquity: number; expectedPayout: number; actualPayout: number;
}

export interface Player { id: string; nickname: string; aliases: string[]; notes: string; tags: string[]; firstSeen: string; lastSeen: string; roomIds: string[]; }
export interface BankrollEvent { id: string; timestamp: string; type: 'DEPOSIT' | 'WITHDRAWAL' | 'POKER_RESULT' | 'ADJUSTMENT' | 'TRANSFER'; amount: number; currency: Currency; note: string; source: 'manual' | 'session' | 'expense'; sessionId?: string; expenseId?: string; }
export interface Setting { key: string; value: unknown; }
export interface AppMetadata { key: string; value: unknown; }

export interface SessionMetrics {
  totalIn: number; cashOut: number; tableTips: number; endTips: number; expenses: number;
  grossResult: number; netResult: number; durationMs: number; grossHourly: number; netHourly: number; bbPerHour: number;
}
export interface LiveSessionMetrics extends SessionMetrics { recordedPokerResult: number; trackedStack: number; trackedStackBb: number; liveNetResult: number; }

export interface FilterModel { period: 'week' | 'month' | 'year' | 'all'; roomId: string; query: string; result: 'all' | 'winning' | 'losing'; }
export interface AppData {
  pokerRooms: PokerRoom[]; sessions: Session[]; sessionCashEvents: SessionCashEvent[]; sessionBreaks: SessionBreak[];
  hands: Hand[]; allIns: AllIn[]; players: Player[]; bankrollEvents: BankrollEvent[]; settings: Setting[];
}
