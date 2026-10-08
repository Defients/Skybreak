/**
 * Leaf module — AI policy constants shared by combatRunner and simRunner.
 * No engine imports; safe from circular dependencies.
 */
import type { ItemUsageStrategy } from "../types/batch";

export function getItemUsageThreshold(strategy: ItemUsageStrategy): number {
  switch (strategy) {
    case "never": return 0;
    case "conservative": return 0.3;
    case "aggressive": return 0.6;
    case "always-if-hurt": return 0.9;
    default: return 0.3;
  }
}
