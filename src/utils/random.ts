import type { RandomEvent } from "../types/events";
import type { DiceResult } from "../types/combat";

function mulberry32(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash) || 1;
}

export class RngEngine {
  private rng: () => number;
  private seed: string;
  private step: number = 0;
  private history: RandomEvent[] = [];
  private forcedResults: Map<number, number> = new Map();
  private static readonly MAX_HISTORY = 200;

  // Physical Table Bridge: a FIFO queue of physical die results.
  // When non-empty, rollD6/roll2D6 consume from this queue instead of
  // generating values from the seeded PRNG. This lets a human at a
  // physical table inject real die rolls without changing any engine
  // function signatures.
  private physicalRollQueue: number[] = [];
  // Physical cards for the next flipPeonCards call. Cleared after use.
  private physicalCardsOverride: import("../types/cards").Card[] | null = null;

  constructor(seed: string) {
    this.seed = seed;
    this.rng = mulberry32(hashStringToSeed(seed));
  }

  get currentStep(): number {
    return this.step;
  }

  get currentSeed(): string {
    return this.seed;
  }

  get historyLog(): RandomEvent[] {
    return [...this.history];
  }

  private next(): number {
    if (this.forcedResults.has(this.step)) {
      const forced = this.forcedResults.get(this.step)!;
      this.step++;
      return forced;
    }
    const val = this.rng();
    this.step++;
    return val;
  }

  forceResult(step: number, value: number): void {
    this.forcedResults.set(step, value);
  }

  clearForcedResults(): void {
    this.forcedResults.clear();
  }

  // ─── Physical Table Bridge API ───────────────────────────────

  /** Queue physical die results to be consumed by future rollD6 calls. */
  setPhysicalRolls(values: number[]): void {
    this.physicalRollQueue = [...values];
  }

  /** Set physical cards for the next flipPeonCards call. */
  setPhysicalCards(cards: import("../types/cards").Card[]): void {
    this.physicalCardsOverride = [...cards];
  }

  /** Get and clear the physical cards override (called by flipPeonCards). */
  consumePhysicalCards(): import("../types/cards").Card[] | null {
    const cards = this.physicalCardsOverride;
    this.physicalCardsOverride = null;
    return cards;
  }

  /** Check if physical rolls are queued (without consuming). */
  get hasPhysicalRolls(): boolean {
    return this.physicalRollQueue.length > 0;
  }

  /** Clear all physical overrides. */
  clearPhysicalOverrides(): void {
    this.physicalRollQueue = [];
    this.physicalCardsOverride = null;
  }

  private pushHistory(event: RandomEvent): void {
    this.history.push(event);
    if (this.history.length > RngEngine.MAX_HISTORY) {
      this.history.shift();
    }
  }

  rollD6(label: string = "d6"): DiceResult {
    let raw: number;
    let physical = false;
    if (this.physicalRollQueue.length > 0) {
      raw = this.physicalRollQueue.shift()!;
      physical = true;
    } else {
      raw = Math.floor(this.next() * 6) + 1;
    }
    this.pushHistory({
      step: this.step - 1,
      type: physical ? "d6-physical" : "d6",
      label,
      result: raw,
    });
    return {
      label,
      rolls: [raw],
      total: raw,
      modifiedTotal: raw,
      modifiers: [],
      step: this.step - 1,
    };
  }

  roll2D6(label: string = "2d6"): DiceResult {
    let r1: number, r2: number;
    let physical = false;
    if (this.physicalRollQueue.length >= 2) {
      r1 = this.physicalRollQueue.shift()!;
      r2 = this.physicalRollQueue.shift()!;
      physical = true;
    } else {
      r1 = Math.floor(this.next() * 6) + 1;
      r2 = Math.floor(this.next() * 6) + 1;
    }
    const total = r1 + r2;
    this.pushHistory({
      step: this.step - 2,
      type: physical ? "2d6-physical" : "2d6",
      label,
      result: [r1, r2],
    });
    return {
      label,
      rolls: [r1, r2],
      total,
      modifiedTotal: total,
      modifiers: [],
      step: this.step - 2,
    };
  }

  shuffleDeck<T>(deck: T[], label: string = "shuffle"): T[] {
    const result = [...deck];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    this.pushHistory({
      step: this.step,
      type: "shuffle",
      label,
      result: result.map((item) => (item as unknown as { id?: string }).id ?? "?"),
    });
    return result;
  }

  drawCard<T>(deck: T[], label: string = "draw"): T | undefined {
    if (deck.length === 0) return undefined;
    const card = deck[0];
    this.pushHistory({
      step: this.step,
      type: "draw",
      label,
      result: (card as unknown as { id?: string }).id ?? "?",
    });
    return card;
  }

  chooseRandom<T>(items: T[], label: string = "chooseRandom"): T {
    const index = Math.floor(this.next() * items.length);
    this.pushHistory({
      step: this.step - 1,
      type: "chooseRandom",
      label,
      result: index,
    });
    return items[index];
  }

  assignD6Target<T>(items: T[], label: string = "assignD6"): T {
    if (items.length === 0) throw new Error("Cannot assign D6 target to empty list");
    if (items.length === 1) return items[0];

    let roll: number;
    let attempts = 0;
    do {
      roll = Math.floor(this.next() * 6) + 1;
      attempts++;
      if (attempts > 100) break;
    } while (roll > items.length);

    const index = Math.min(roll - 1, items.length - 1);
    this.pushHistory({
      step: this.step - 1,
      type: "assignD6",
      label,
      result: { roll, index },
    });
    return items[index];
  }

  clone(): RngEngine {
    const clone = new RngEngine(this.seed);
    for (let i = 0; i < this.step; i++) {
      clone.rng();
    }
    clone.step = this.step;
    clone.history = [...this.history];
    clone.forcedResults = new Map(this.forcedResults);
    return clone;
  }

  serialize(): { seed: string; step: number; history: RandomEvent[] } {
    return {
      seed: this.seed,
      step: this.step,
      history: [...this.history],
    };
  }

  static deserialize(data: { seed: string; step: number; history: RandomEvent[] }): RngEngine {
    // Bound the step to guard against malformed saves. A negative, non-finite,
    // or absurdly large step would either loop unboundedly (DoS on load) or
    // produce a nonsensical replay position. 1,000,000 steps is far beyond any
    // real run length and keeps deserialization fast.
    const step = typeof data.step === "number" && Number.isFinite(data.step)
      ? Math.max(0, Math.min(Math.floor(data.step), 1_000_000))
      : 0;
    const engine = new RngEngine(data.seed);
    for (let i = 0; i < step; i++) {
      engine.rng();
    }
    engine.step = step;
    engine.history = Array.isArray(data.history) ? [...data.history] : [];
    return engine;
  }
}
