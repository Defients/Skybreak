import { describe, it, expect } from "vitest";
import { advanceRoom, markRoomResolved, getLivingHeroes, getDeadHeroes, getHeroById, checkPartyDefeat } from "../engine/rulesEngine";
import { initializeGame, createDefaultConfig, type PartySetupChoice } from "../engine/gameState";
import { RngEngine } from "../utils/random";
import type { GameState } from "../types/gameState";

describe("Rules Engine", () => {
  const sampleParty: PartySetupChoice[] = [
    { className: "Bladedancer", suit: "spades", position: 1 },
    { className: "Manipulator", suit: "hearts", position: 2 },
    { className: "Tracker", suit: "clubs", position: 3 },
  ];

  function createTestState(seed = "rules-test"): GameState {
    const config = createDefaultConfig({ seed });
    return initializeGame(config, sampleParty);
  }

  it("getLivingHeroes returns only alive heroes", () => {
    const state = createTestState();
    state.party.heroes[0].alive = false;
    const living = getLivingHeroes(state);
    expect(living).toHaveLength(2);
    expect(living.every((h) => h.alive)).toBe(true);
  });

  it("getDeadHeroes returns only dead heroes", () => {
    const state = createTestState();
    state.party.heroes[0].alive = false;
    const dead = getDeadHeroes(state);
    expect(dead).toHaveLength(1);
    expect(dead.every((h) => !h.alive)).toBe(true);
  });

  it("getHeroById finds existing hero", () => {
    const state = createTestState();
    const hero = state.party.heroes[0];
    const found = getHeroById(state, hero.id);
    expect(found).toBeDefined();
    expect(found?.id).toBe(hero.id);
  });

  it("getHeroById returns undefined for non-existent id", () => {
    const state = createTestState();
    const found = getHeroById(state, "non-existent-id");
    expect(found).toBeUndefined();
  });

  it("checkPartyDefeat returns true when all heroes dead", () => {
    const state = createTestState();
    state.party.heroes.forEach((h) => (h.alive = false));
    expect(checkPartyDefeat(state)).toBe(true);
  });

  it("checkPartyDefeat returns false when at least one hero alive", () => {
    const state = createTestState();
    state.party.heroes[0].alive = false;
    state.party.heroes[1].alive = false;
    expect(checkPartyDefeat(state)).toBe(false);
  });

  it("markRoomResolved sets resolved flag and increments stats", () => {
    const state = createTestState();
    const initialCleared = state.stats.roomsCleared;
    const newState = markRoomResolved(state);
    expect(newState.spire.currentRoom?.resolved).toBe(true);
    expect(newState.stats.roomsCleared).toBe(initialCleared + 1);
  });

  it("advanceRoom moves to next room", () => {
    const state = createTestState();
    const initialIndex = state.spire.roomIndex;
    const newState = advanceRoom(state);
    expect(newState.spire.roomIndex).toBe(initialIndex + 1);
  });

  it("advanceRoom emits a ROOM_REVEALED event", () => {
    const state = createTestState();
    const initialLogLength = state.log.length;
    const newState = advanceRoom(state);
    expect(newState.log.length).toBeGreaterThan(initialLogLength);
    const lastEvent = newState.log[newState.log.length - 1];
    expect(lastEvent.type).toBe("ROOM_REVEALED");
  });
});
