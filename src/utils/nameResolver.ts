import type { GameState } from "../types/gameState";
import type { HeroClassName } from "../types/heroes";

export const CLASS_TEXT_COLORS: Record<HeroClassName, string> = {
  Bladedancer: "text-spire-danger",
  Manipulator: "text-spire-violet",
  Tracker: "text-spire-teal",
  Guardian: "text-spire-accent",
};

const SPECIAL_NAMES: Record<string, string> = {
  hazard: "Hazard",
  poison: "Poison",
  burn: "Burn",
  aetherpulse: "Aetherpulse",
};

export function resolveActorName(state: GameState, actorId: string): string {
  if (!actorId) return "Unknown";

  if (SPECIAL_NAMES[actorId]) return SPECIAL_NAMES[actorId];

  const hero = state.party.heroes.find((h) => h.id === actorId);
  if (hero) return hero.className;

  if (state.combat) {
    if (state.combat.monster.id === actorId) return state.combat.monster.name;
    const summon = state.combat.summons.find((s) => s.id === actorId);
    if (summon) return summon.name;
  }

  return actorId;
}

export function resolveTargetName(
  state: GameState,
  targetId: string,
  isMonsterTarget: boolean
): string {
  if (!targetId) return "Unknown";

  if (isMonsterTarget && state.combat) {
    if (state.combat.monster.id === targetId) return state.combat.monster.name;
    const summon = state.combat.summons.find((s) => s.id === targetId);
    if (summon) return summon.name;
  }

  const hero = state.party.heroes.find((h) => h.id === targetId);
  if (hero) return hero.className;

  if (SPECIAL_NAMES[targetId]) return SPECIAL_NAMES[targetId];

  return targetId;
}
