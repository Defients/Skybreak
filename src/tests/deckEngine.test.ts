import { describe, it, expect } from "vitest";
import {
  createRoyaltyDeck,
  createPeonDeck,
  createJokerDeck,
  createDeckManager,
  drawFromDeck,
  drawMultiple,
  drawWithoutDiscard,
  drawMultipleWithoutDiscard,
  returnToDrawPile,
  reshuffleDeck,
  getDeckSize,
  getTotalDeckSize,
  peekDeck,
} from "../engine/deckEngine";
import { RngEngine } from "../utils/random";

describe("Deck Engine", () => {
  it("creates a royalty deck with 16 cards (4 suits x 4 ranks)", () => {
    const cards = createRoyaltyDeck();
    expect(cards).toHaveLength(16);
  });

  it("creates a peon deck with 36 cards (4 suits x 9 ranks)", () => {
    const cards = createPeonDeck();
    expect(cards).toHaveLength(36);
  });

  it("creates a joker deck with 2 cards", () => {
    const cards = createJokerDeck();
    expect(cards).toHaveLength(2);
  });

  it("peon deck contains cards of all suits", () => {
    const cards = createPeonDeck();
    const suits = new Set(cards.map((c) => c.suit));
    expect(suits.has("clubs")).toBe(true);
    expect(suits.has("diamonds")).toBe(true);
    expect(suits.has("hearts")).toBe(true);
    expect(suits.has("spades")).toBe(true);
  });

  it("royalty deck contains face cards (A, K, Q, J)", () => {
    const cards = createRoyaltyDeck();
    const ranks = new Set(cards.map((c) => c.rank));
    expect(ranks.has("A")).toBe(true);
    expect(ranks.has("K")).toBe(true);
    expect(ranks.has("Q")).toBe(true);
    expect(ranks.has("J")).toBe(true);
  });

  it("createDeckManager produces 4 decks", () => {
    const rng = new RngEngine("deck-test");
    const dm = createDeckManager(rng, "J");
    expect(dm.royalty).toBeDefined();
    expect(dm.peon).toBeDefined();
    expect(dm.joker).toBeDefined();
    expect(dm.environment).toBeDefined();
  });

  it("drawFromDeck removes a card from drawPile", () => {
    const rng = new RngEngine("draw-test");
    const dm = createDeckManager(rng, "J");
    const initialSize = getDeckSize(dm.peon);
    const card = drawFromDeck(dm.peon);
    expect(card).toBeDefined();
    expect(getDeckSize(dm.peon)).toBe(initialSize - 1);
  });

  it("drawMultiple draws correct number of cards", () => {
    const rng = new RngEngine("multi-test");
    const dm = createDeckManager(rng, "J");
    const cards = drawMultiple(dm.peon, 5);
    expect(cards).toHaveLength(5);
  });

  it("peekDeck does not remove cards", () => {
    const rng = new RngEngine("peek-test");
    const dm = createDeckManager(rng, "J");
    const initialSize = getDeckSize(dm.peon);
    const peeked = peekDeck(dm.peon, 3);
    expect(peeked).toHaveLength(3);
    expect(getDeckSize(dm.peon)).toBe(initialSize);
  });

  it("reshuffleDeck restores all cards to drawPile", () => {
    const rng = new RngEngine("reshuffle-test");
    const dm = createDeckManager(rng, "J");
    drawMultiple(dm.peon, 10);
    const totalBefore = getTotalDeckSize(dm.peon);
    reshuffleDeck(dm.peon, rng);
    expect(getDeckSize(dm.peon)).toBe(totalBefore);
    expect(dm.peon.discardPile).toHaveLength(0);
  });

  it("drawFromDeck on fully empty deck returns undefined", () => {
    const rng = new RngEngine("empty-test");
    const dm = createDeckManager(rng, "J");
    const jokerSize = getDeckSize(dm.joker);
    for (let i = 0; i < jokerSize; i++) drawFromDeck(dm.joker);
    dm.joker.discardPile = [];
    const card = drawFromDeck(dm.joker);
    expect(card).toBeUndefined();
  });

  it("drawFromDeck reshuffles from discardPile when drawPile is empty", () => {
    const rng = new RngEngine("recycle-test");
    const dm = createDeckManager(rng, "J");
    const total = getTotalDeckSize(dm.joker);
    for (let i = 0; i < total; i++) drawFromDeck(dm.joker);
    expect(getDeckSize(dm.joker)).toBe(0);
    expect(dm.joker.discardPile.length).toBe(total);
    const card = drawFromDeck(dm.joker);
    expect(card).toBeDefined();
  });

  it("drawWithoutDiscard removes from drawPile without adding to discardPile", () => {
    const rng = new RngEngine("nondiscard-test");
    const dm = createDeckManager(rng, "J");
    const initialSize = getDeckSize(dm.peon);
    const card = drawWithoutDiscard(dm.peon);
    expect(card).toBeDefined();
    expect(getDeckSize(dm.peon)).toBe(initialSize - 1);
    expect(dm.peon.discardPile).toHaveLength(0);
  });

  it("drawMultipleWithoutDiscard draws correct number without discard", () => {
    const rng = new RngEngine("multi-nondiscard-test");
    const dm = createDeckManager(rng, "J");
    const initialSize = getDeckSize(dm.peon);
    const cards = drawMultipleWithoutDiscard(dm.peon, 5);
    expect(cards).toHaveLength(5);
    expect(getDeckSize(dm.peon)).toBe(initialSize - 5);
    expect(dm.peon.discardPile).toHaveLength(0);
  });

  it("returnToDrawPile puts cards back at the top", () => {
    const rng = new RngEngine("return-test");
    const dm = createDeckManager(rng, "J");
    const cards = drawMultipleWithoutDiscard(dm.peon, 3);
    const sizeBeforeReturn = getDeckSize(dm.peon);
    returnToDrawPile(dm.peon, cards);
    expect(getDeckSize(dm.peon)).toBe(sizeBeforeReturn + 3);
    expect(dm.peon.drawPile.slice(0, 3)).toEqual(cards);
  });

  it("drawWithoutDiscard reshuffles from discardPile when drawPile is empty", () => {
    const rng = new RngEngine("nondiscard-recycle-test");
    const dm = createDeckManager(rng, "J");
    const total = getTotalDeckSize(dm.joker);
    for (let i = 0; i < total; i++) drawFromDeck(dm.joker);
    expect(getDeckSize(dm.joker)).toBe(0);
    expect(dm.joker.discardPile.length).toBe(total);
    const card = drawWithoutDiscard(dm.joker);
    expect(card).toBeDefined();
    expect(dm.joker.discardPile).toHaveLength(0);
  });
});
