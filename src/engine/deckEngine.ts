import type { Card, Deck, DeckManager, Suit, Rank, DeckType } from "../types/cards";
import { rankToNumber, suitSymbol } from "../types/cards";
import { RngEngine } from "../utils/random";
import { generateId } from "../utils/ids";

const ROYALTY_RANKS: Rank[] = ["A", "K", "Q", "J"];
const PEON_RANKS: Rank[] = ["10", "9", "8", "7", "6", "5", "4", "3", "2"];
const ALL_SUITS: Suit[] = ["clubs", "diamonds", "hearts", "spades"];

function createCard(suit: Suit, rank: Rank, deckType: DeckType): Card {
  return {
    id: generateId("card"),
    suit,
    rank,
    display: rank === "JOKER" ? "JOKER" : `${rank}${suitSymbol(suit)}`,
    deckType,
  };
}

export function createRoyaltyDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of ALL_SUITS) {
    for (const rank of ROYALTY_RANKS) {
      cards.push(createCard(suit, rank, "royalty"));
    }
  }
  return cards;
}

export function createPeonDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of ALL_SUITS) {
    for (const rank of PEON_RANKS) {
      cards.push(createCard(suit, rank, "peon"));
    }
  }
  return cards;
}

export function createJokerDeck(): Card[] {
  return [
    createCard("joker", "JOKER", "joker"),
    createCard("joker", "JOKER", "joker"),
  ];
}

export function createEnvironmentDeck(unusedClassRank: string): Card[] {
  const cards: Card[] = [];
  const peonCards = createPeonDeck();
  const classCards = peonCards.filter((c) => c.rank === (unusedClassRank as Rank));
  for (const suit of ALL_SUITS) {
    const card = classCards.find((c) => c.suit === suit);
    if (card) {
      cards.push({
        ...card,
        id: generateId("env_card"),
        deckType: "environment",
      });
    }
  }
  return cards;
}

export function createDeckManager(
  rng: RngEngine,
  unusedClassRank: string
): DeckManager {
  const royaltyCards = createRoyaltyDeck();
  const peonCards = createPeonDeck();
  const jokerCards = createJokerDeck();
  const envCards = createEnvironmentDeck(unusedClassRank);

  const royaltyShuffled = rng.shuffleDeck(royaltyCards, "royalty_shuffle");
  const peonShuffled = rng.shuffleDeck(peonCards, "peon_shuffle");
  const envShuffled = rng.shuffleDeck(envCards, "environment_shuffle");

  return {
    royalty: {
      id: "royalty",
      type: "royalty",
      cards: royaltyShuffled,
      drawPile: [...royaltyShuffled],
      discardPile: [],
    },
    peon: {
      id: "peon",
      type: "peon",
      cards: peonShuffled,
      drawPile: [...peonShuffled],
      discardPile: [],
    },
    joker: {
      id: "joker",
      type: "joker",
      cards: jokerCards,
      drawPile: [...jokerCards],
      discardPile: [],
    },
    environment: {
      id: "environment",
      type: "environment",
      cards: envShuffled,
      drawPile: [...envShuffled],
      discardPile: [],
    },
  };
}

export function drawFromDeck(deck: Deck): Card | undefined {
  if (deck.drawPile.length === 0) {
    if (deck.discardPile.length === 0) return undefined;
    deck.drawPile = [...deck.discardPile];
    deck.discardPile = [];
  }
  const card = deck.drawPile.shift();
  if (card) {
    deck.discardPile.push(card);
  }
  return card;
}

export function drawMultiple(deck: Deck, count: number): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i < count; i++) {
    const card = drawFromDeck(deck);
    if (card) cards.push(card);
  }
  return cards;
}

export function drawWithoutDiscard(deck: Deck): Card | undefined {
  if (deck.drawPile.length === 0) {
    if (deck.discardPile.length === 0) return undefined;
    deck.drawPile = [...deck.discardPile];
    deck.discardPile = [];
  }
  return deck.drawPile.shift();
}

export function drawMultipleWithoutDiscard(deck: Deck, count: number): Card[] {
  const cards: Card[] = [];
  for (let i = 0; i < count; i++) {
    const card = drawWithoutDiscard(deck);
    if (card) cards.push(card);
  }
  return cards;
}

export function returnToDrawPile(deck: Deck, cards: Card[]): void {
  deck.drawPile = [...cards, ...deck.drawPile];
}

export function reshuffleDeck(deck: Deck, rng: RngEngine): void {
  const allCards = [...deck.drawPile, ...deck.discardPile];
  const shuffled = rng.shuffleDeck(allCards, `reshuffle_${deck.id}`);
  deck.drawPile = shuffled;
  deck.discardPile = [];
}

export function peekDeck(deck: Deck, count: number = 1): Card[] {
  return deck.drawPile.slice(0, count);
}

export function getDeckSize(deck: Deck): number {
  return deck.drawPile.length;
}

export function getTotalDeckSize(deck: Deck): number {
  return deck.drawPile.length + deck.discardPile.length;
}

export function forceDrawCard(deck: Deck, cardId: string): Card | undefined {
  const index = deck.drawPile.findIndex((c) => c.id === cardId);
  if (index === -1) return undefined;
  const [card] = deck.drawPile.splice(index, 1);
  if (card) {
    deck.discardPile.push(card);
  }
  return card;
}

export function manualDrawCard(deck: Deck, suit: Suit, rank: Rank): Card | undefined {
  const index = deck.drawPile.findIndex((c) => c.suit === suit && c.rank === rank);
  if (index === -1) return undefined;
  const [card] = deck.drawPile.splice(index, 1);
  if (card) {
    deck.discardPile.push(card);
  }
  return card;
}

export function compareCards(a: Card, b: Card): number {
  return rankToNumber(a.rank) - rankToNumber(b.rank);
}
