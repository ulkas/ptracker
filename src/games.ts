import type { GameType, Hand } from './types';

export const GAME_TYPES: GameType[] = ['NLH', 'PLO4', 'PLO5', 'PLO4_DOUBLE_BOARD_BOMB_POT'];

export const GAME_META: Record<GameType, { label: string; holeCards: number; boards: number; omaha: boolean }> = {
  NLH: { label: 'NLH', holeCards: 2, boards: 1, omaha: false },
  PLO4: { label: 'PLO4', holeCards: 4, boards: 1, omaha: true },
  PLO5: { label: 'PLO5', holeCards: 5, boards: 1, omaha: true },
  PLO4_DOUBLE_BOARD_BOMB_POT: { label: 'DBBP PLO4', holeCards: 4, boards: 2, omaha: true },
};

export const gameLabel = (game: GameType | undefined) => GAME_META[game ?? 'NLH'].label;
export const gameMeta = (game: GameType | undefined) => GAME_META[game ?? 'NLH'];
export const handGame = (hand: Hand, sessionGame?: GameType): GameType => hand.gameType ?? sessionGame ?? 'NLH';

export function normalizeBoards(hand: Hand): string[][] {
  if (hand.boards?.length) return hand.boards;
  return hand.board.length ? [hand.board] : [[]];
}

export function validateHandShape(game: GameType, heroCards: string[], boards: string[][]) {
  const meta = gameMeta(game);
  if (heroCards.length > meta.holeCards) throw new Error(`${meta.label} allows at most ${meta.holeCards} hole cards.`);
  if (boards.length > meta.boards) throw new Error(`${meta.label} allows at most ${meta.boards} board${meta.boards === 1 ? '' : 's'}.`);
  if (boards.some((board) => board.length > 5)) throw new Error('Each board can contain at most five cards.');
  const allCards = [...heroCards, ...boards.flat()];
  if (allCards.some((card) => !/^[2-9TJQKA][shdc]$/i.test(card))) throw new Error('Cards must use standard Hold’em notation such as As or Td.');
  if (new Set(allCards).size !== allCards.length) throw new Error('A physical card can only be used once.');
}
