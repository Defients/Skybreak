import { describe, it, expect } from "vitest";
import { RngEngine } from "../utils/random";

describe("RngEngine", () => {
  it("produces deterministic values for the same seed", () => {
    const rng1 = new RngEngine("test-seed-1");
    const rng2 = new RngEngine("test-seed-1");
    const rolls1 = Array.from({ length: 10 }, () => rng1.rollD6("test"));
    const rolls2 = Array.from({ length: 10 }, () => rng2.rollD6("test"));
    expect(rolls1).toEqual(rolls2);
  });

  it("produces different values for different seeds", () => {
    const rng1 = new RngEngine("seed-a");
    const rng2 = new RngEngine("seed-b");
    const rolls1 = Array.from({ length: 5 }, () => rng1.rollD6("test"));
    const rolls2 = Array.from({ length: 5 }, () => rng2.rollD6("test"));
    expect(rolls1).not.toEqual(rolls2);
  });

  it("rolls D6 between 1 and 6", () => {
    const rng = new RngEngine("d6-test");
    for (let i = 0; i < 100; i++) {
      const roll = rng.rollD6("test");
      expect(roll.total).toBeGreaterThanOrEqual(1);
      expect(roll.total).toBeLessThanOrEqual(6);
    }
  });

  it("rolls 2D6 between 2 and 12", () => {
    const rng = new RngEngine("2d6-test");
    for (let i = 0; i < 100; i++) {
      const roll = rng.roll2D6("test");
      expect(roll.total).toBeGreaterThanOrEqual(2);
      expect(roll.total).toBeLessThanOrEqual(12);
    }
  });

  it("tracks step count", () => {
    const rng = new RngEngine("step-test");
    expect(rng.currentStep).toBe(0);
    rng.rollD6("a");
    expect(rng.currentStep).toBe(1);
    rng.rollD6("b");
    expect(rng.currentStep).toBe(2);
  });

  it("serializes and restores state", () => {
    const rng = new RngEngine("serialize-test");
    rng.rollD6("a");
    rng.rollD6("b");
    const serialized = rng.serialize();
    const restored = RngEngine.deserialize(serialized);
    const roll1 = rng.rollD6("c");
    const roll2 = restored.rollD6("c");
    expect(roll1).toEqual(roll2);
  });

  it("shuffles arrays deterministically", () => {
    const rng1 = new RngEngine("shuffle-test");
    const rng2 = new RngEngine("shuffle-test");
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled1 = rng1.shuffleDeck([...arr]);
    const shuffled2 = rng2.shuffleDeck([...arr]);
    expect(shuffled1).toEqual(shuffled2);
    expect(shuffled1).not.toEqual(arr);
  });

  it("picks random elements deterministically", () => {
    const rng1 = new RngEngine("pick-test");
    const rng2 = new RngEngine("pick-test");
    const items = ["a", "b", "c", "d", "e"];
    const pick1 = rng1.chooseRandom(items);
    const pick2 = rng2.chooseRandom(items);
    expect(pick1).toEqual(pick2);
  });
});
