import { describe, expect, it } from 'vitest';
import { GAME_META, GAME_TYPES, normalizeBoards, validateHandShape } from '../src/games';
import type { Hand } from '../src/types';

const base = (gameType: Hand['gameType']): Hand => ({ id: 'h', timestamp: new Date().toISOString(), tableSize: 6, smallBlind: 100, bigBlind: 200, currency: 'EUR', effectiveStack: 0, heroPosition: 'BTN', heroCards: [], board: [], boards: [[]], gameType, entryMode: 'detailed', result: 0, notes: '', tags: [], actions: [] });

describe('game metadata and hand shape', () => {
  it('exposes all supported variants', () => { expect(GAME_TYPES).toEqual(['NLH', 'PLO4', 'PLO5', 'PLO4_DOUBLE_BOARD_BOMB_POT']); expect(GAME_META.PLO4.holeCards).toBe(4); expect(GAME_META.PLO5.holeCards).toBe(5); expect(GAME_META.PLO4_DOUBLE_BOARD_BOMB_POT.boards).toBe(2); });
  it('accepts partial PLO boards and rejects too many cards', () => { validateHandShape('PLO4', ['As', 'Kh', 'Qc'], [['2s', '3s']]); expect(() => validateHandShape('PLO4', ['As', 'Kh', 'Qc', 'Jd', 'Tc'], [[]])).toThrow(/at most 4/); });
  it('validates double-board PLO and duplicate physical cards', () => { validateHandShape('PLO4_DOUBLE_BOARD_BOMB_POT', ['As', 'Kh', 'Qc', 'Jd'], [['2s'], ['3h']]); expect(() => validateHandShape('PLO4_DOUBLE_BOARD_BOMB_POT', ['As', 'Kh', 'Qc', 'Jd'], [['2s'], ['3h'], ['4c']])).toThrow(/at most 2/); expect(() => validateHandShape('PLO4', ['As', 'Kh'], [['As']])).toThrow(/once/); });
  it('normalizes legacy single-board records', () => { const hand = base('NLH'); hand.boards = undefined; hand.board = ['Ah', 'Kd']; expect(normalizeBoards(hand)).toEqual([['Ah', 'Kd']]); });
});
