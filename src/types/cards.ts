export type Suit = "clubs" | "diamonds" | "hearts" | "spades" | "joker";

export type Rank =
  | "A"
  | "K"
  | "Q"
  | "J"
  | "10"
  | "9"
  | "8"
  | "7"
  | "6"
  | "5"
  | "4"
  | "3"
  | "2"
  | "JOKER";

export type DeckType = "royalty" | "peon" | "joker" | "environment";

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  display: string;
  deckType: DeckType;
}

export interface Deck {
  id: string;
  type: DeckType;
  cards: Card[];
  drawPile: Card[];
  discardPile: Card[];
}

export interface DeckManager {
  royalty: Deck;
  peon: Deck;
  joker: Deck;
  environment: Deck;
}

export interface CardFlipEvent {
  id: string;
  actorId: string;
  cards: Card[];
  timestamp: number;
  sequence: number;
}

export function rankToNumber(rank: Rank): number {
  const order: Record<Rank, number> = {
    A: 14,
    K: 13,
    Q: 12,
    J: 11,
    "10": 10,
    "9": 9,
    "8": 8,
    "7": 7,
    "6": 6,
    "5": 5,
    "4": 4,
    "3": 3,
    "2": 2,
    JOKER: 0,
  };
  return order[rank] ?? 0;
}

export function isRedSuit(suit: Suit): boolean {
  return suit === "diamonds" || suit === "hearts";
}

export const APC_COLORS = {
  red: "#f43f5e",
  black: "#e2e8f0",
  redBg: "rgba(244,63,94,0.15)",
  blackBg: "rgba(34,211,238,0.1)",
  redBgGradient: "linear-gradient(135deg, rgba(244,63,94,0.15) 0%, rgba(5,5,12,0.8) 100%)",
  blackBgGradient: "linear-gradient(135deg, rgba(34,211,238,0.1) 0%, rgba(5,5,12,0.8) 100%)",
  redBorder: "rgba(244,63,94,0.4)",
  blackBorder: "rgba(34,211,238,0.3)",
} as const;

export function getApcColors(suit: Suit) {
  const red = isRedSuit(suit);
  return {
    red,
    color: red ? APC_COLORS.red : APC_COLORS.black,
    background: red ? APC_COLORS.redBgGradient : APC_COLORS.blackBgGradient,
    borderColor: red ? APC_COLORS.redBorder : APC_COLORS.blackBorder,
  };
}

export function suitSymbol(suit: Suit): string {
  const symbols: Record<Suit, string> = {
    clubs: "♣️",
    diamonds: "♦️",
    hearts: "❤️",
    spades: "♠️",
    joker: "🃏",
  };
  return symbols[suit];
}
