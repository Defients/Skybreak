import { RngEngine } from "../utils/random";
import type { DiceResult } from "../types/combat";

export class DiceEngine {
  constructor(private rng: RngEngine) {}

  rollD6(label: string = "d6"): DiceResult {
    return this.rng.rollD6(label);
  }

  roll2D6(label: string = "2d6"): DiceResult {
    return this.rng.roll2D6(label);
  }

  rollWithModifiers(
    baseRoll: DiceResult,
    modifiers: { value: number; source: string }[]
  ): DiceResult {
    const totalMods = modifiers.reduce((sum, m) => sum + m.value, 0);
    return {
      ...baseRoll,
      modifiers: modifiers.map((m) => `${m.value >= 0 ? "+" : ""}${m.value} (${m.source})`),
      modifiedTotal: Math.max(1, baseRoll.total + totalMods),
    };
  }

  rollD6WithModifiers(
    label: string,
    modifiers: { value: number; source: string }[]
  ): DiceResult {
    const base = this.rollD6(label);
    return this.rollWithModifiers(base, modifiers);
  }

  get rngEngine(): RngEngine {
    return this.rng;
  }
}
