import { describe, expect, it } from 'vitest';
import { calculateEquity, handScore, parseCards } from '../src/poker';

describe('cards and equity', () => {
  it('rejects duplicate physical cards', () => expect(() => parseCards('As As')).toThrow(/once/));
  it('ranks a straight flush above quads', () => expect(handScore(parseCards('As Ks Qs Js Ts 2d 3c'))).toBeGreaterThan(handScore(parseCards('Ac Ad Ah As Kd 2c 3h'))));
  it('detects a locked tie', () => { const result = calculateEquity(parseCards('2c 3d'), [parseCards('4c 5d')], parseCards('As Ks Qs Js Ts')); expect(result.win).toBe(0); expect(result.tie).toBe(.5); expect(result.equity).toBe(.5); });
  it('rejects duplicates across players', () => expect(() => calculateEquity(parseCards('As Kh'), [parseCards('As Qd')], [])).toThrow(/Duplicate/));
});
