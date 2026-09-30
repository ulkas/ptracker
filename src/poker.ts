const ranks = '23456789TJQKA';
const suits = 'cdhs';
export const fullDeck = [...ranks].flatMap((rank) => [...suits].map((suit) => rank + suit));

export function parseCards(value: string) {
  const cards = value.toUpperCase().replaceAll('10', 'T').split(/[\s,;|/]+/).filter(Boolean).map((card) => card[0] + (card[1]?.toLowerCase() ?? ''));
  if (cards.some((card) => !/^[2-9TJQKA][CDHS]$/.test(card.toUpperCase()))) throw new Error('Use cards such as As Kh or 10c.');
  if (new Set(cards).size !== cards.length) throw new Error('A physical card can only be used once.');
  return cards;
}

function fiveCardScore(cards: string[]) {
  const values = cards.map((card) => ranks.indexOf(card[0]!) + 2).sort((a, b) => b - a);
  const counts = new Map<number, number>(); values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = cards.every((card) => card[1] === cards[0]?.[1]);
  const unique = [...new Set(values)]; if (unique[0] === 14) unique.push(1);
  let straightHigh = 0;
  for (let index = 0; index <= unique.length - 5; index++) if (unique[index]! - unique[index + 4]! === 4) straightHigh = Math.max(straightHigh, unique[index]!);
  const encode = (category: number, tie: number[]) => [category, ...tie, 0, 0, 0, 0, 0].slice(0, 6).reduce((score, value) => score * 15 + value, 0);
  if (straightHigh && flush) return encode(8, [straightHigh]);
  if (groups[0]?.[1] === 4) return encode(7, [groups[0][0], groups[1]![0]]);
  if (groups[0]?.[1] === 3 && groups[1]?.[1] === 2) return encode(6, [groups[0][0], groups[1][0]]);
  if (flush) return encode(5, values);
  if (straightHigh) return encode(4, [straightHigh]);
  if (groups[0]?.[1] === 3) return encode(3, [groups[0][0], ...groups.slice(1).map((group) => group[0]).sort((a, b) => b - a)]);
  if (groups[0]?.[1] === 2 && groups[1]?.[1] === 2) return encode(2, [Math.max(groups[0][0], groups[1][0]), Math.min(groups[0][0], groups[1][0]), groups[2]![0]]);
  if (groups[0]?.[1] === 2) return encode(1, [groups[0][0], ...groups.slice(1).map((group) => group[0]).sort((a, b) => b - a)]);
  return encode(0, values);
}

export function handScore(cards: string[]) {
  if (cards.length < 5 || cards.length > 7) throw new Error('A poker hand needs five to seven cards.');
  let best = 0;
  for (let a = 0; a < cards.length - 4; a++) for (let b = a + 1; b < cards.length - 3; b++) for (let c = b + 1; c < cards.length - 2; c++) for (let d = c + 1; d < cards.length - 1; d++) for (let e = d + 1; e < cards.length; e++) best = Math.max(best, fiveCardScore([cards[a]!, cards[b]!, cards[c]!, cards[d]!, cards[e]!]));
  return best;
}

export interface EquityResult { equity: number; win: number; tie: number; trials: number; }

export function calculateEquity(hero: string[], villains: string[][], board: string[], dead: string[] = [], trials = 5000): EquityResult {
  if (hero.length !== 2 || villains.some((hand) => hand.length !== 2)) throw new Error('Enter exactly two cards for every player.');
  if (board.length > 5) throw new Error('The board can contain at most five cards.');
  const known = [...hero, ...villains.flat(), ...board, ...dead];
  if (new Set(known).size !== known.length) throw new Error('Duplicate physical card detected.');
  const available = fullDeck.filter((card) => !known.includes(card));
  const missing = 5 - board.length;
  let wins = 0; let ties = 0;
  const exactRiver = missing <= 1;
  const iterations = exactRiver ? Math.max(1, missing ? available.length : 1) : trials;
  for (let trial = 0; trial < iterations; trial++) {
    const deck = [...available];
    if (!exactRiver) for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j]!, deck[i]!]; }
    const runout = missing ? (exactRiver ? [available[trial]!] : deck.slice(0, missing)) : [];
    const finalBoard = [...board, ...runout];
    const heroScore = handScore([...hero, ...finalBoard]);
    const villainScores = villains.map((hand) => handScore([...hand, ...finalBoard]));
    const best = Math.max(heroScore, ...villainScores);
    if (heroScore === best) {
      const tied = villainScores.filter((score) => score === best).length;
      if (tied) ties += 1 / (tied + 1); else wins++;
    }
  }
  return { win: wins / iterations, tie: ties / iterations, equity: (wins + ties) / iterations, trials: iterations };
}
