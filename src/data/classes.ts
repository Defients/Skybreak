import type { ClassData, HeroClassName } from "../types/heroes";

export const CLASS_DATA: Record<HeroClassName, ClassData> = {
  Bladedancer: {
    name: "Bladedancer",
    baseHp: 16,
    startingGold: 40,
    startingItem: "Minor Health Potion",
    rank: "3",
    role: "Fast strikes and combo chains",
    specializations: {
      black: {
        name: "Shadowblade",
        ability: "Steal target's APC permanently and gain 2🔵 shields, each reducing 2 damage",
        desc: "Steal enemy cards and shield yourself",
      },
      red: {
        name: "Runeblade",
        ability: "Next 3 attacks deal +2 damage; gain ⚫ Might for 3 uses",
        desc: "Empower your blade with runic fury",
      },
    },
    rollTable: [
      { roll: 1, effect: "Quick Strike", description: "Deal 2 damage to target", effectKey: "quick_strike" },
      { roll: 2, effect: "Dodge", description: "Gain 1🔵 and deal 1 damage", effectKey: "dodge" },
      { roll: 3, effect: "Precision", description: "Deal 3 damage, or 4 if any ⚫ Buff is active", effectKey: "precision" },
      { roll: 4, effect: "Eviscerate", description: "Deal 3 damage; roll again. On 5–6, crit for double damage", effectKey: "eviscerate" },
      { roll: 5, effect: "Execute", description: "Deal 4 damage; instant kill if target has ≤5 HP", effectKey: "execute" },
      { roll: 6, effect: "Blade Dance", description: "Deal 3 damage, then roll again, maximum 2 total rerolls", effectKey: "blade_dance" },
    ],
    uniqueMechanic: "Combo chains grant cumulative +1 damage",
    abilityTrigger: "⚛️ Triggers on class-card match, once per combat unless otherwise specified",
  },

  Manipulator: {
    name: "Manipulator",
    baseHp: 17,
    startingGold: 40,
    startingItem: "Mystic Rune",
    rank: "5",
    role: "Mind control and temporal manipulation",
    specializations: {
      black: {
        name: "Timebender",
        ability: "Take an extra turn immediately and heal 3 HP",
        desc: "Bend time to act twice in a row",
      },
      red: {
        name: "Illusionist",
        ability: "Apply 🟡 Illusion to monster for 2 turns; monster suffers -2 to rolls",
        desc: "Disorient enemies with mind-bending illusions",
      },
    },
    rollTable: [
      { roll: 1, effect: "Mind Spike", description: "Deal 2 damage to target", effectKey: "mind_spike" },
      { roll: 2, effect: "Mind Flay", description: "Deal 1 damage; keep rolling while result is even, dealing +1 damage each time", effectKey: "mind_flay" },
      { roll: 3, effect: "Psychic Drain", description: "Deal 3 damage to target and heal self 1 HP", effectKey: "psychic_drain" },
      { roll: 4, effect: "Telekinesis", description: "Roll d6. On 1–3, deal 2 damage. On 4–6, deal 4 damage", effectKey: "telekinesis" },
      { roll: 5, effect: "Mind Control", description: "Force monster to damage itself for 4", effectKey: "mind_control" },
      { roll: 6, effect: "Psionic Storm", description: "Deal 5 damage and heal all allies 1 HP", effectKey: "psionic_storm" },
    ],
    uniqueMechanic: "Can redirect one monster attack once per combat",
    abilityTrigger: "⚛️ Triggers on class-card match, once per combat unless otherwise specified",
  },

  Tracker: {
    name: "Tracker",
    baseHp: 16,
    startingGold: 40,
    startingItem: "Lucky Charm",
    rank: "7",
    role: "Pet companion and ranged attacks",
    specializations: {
      black: {
        name: "Huntmaster",
        ability: "Apply 🔴 Target to enemy and summon Wolf",
        desc: "Mark prey and unleash your wolf companion",
      },
      red: {
        name: "Beastcaller",
        ability: "Summon Bear companion and gain ⚫ Focus for 2 uses, granting +2 to rolls",
        desc: "Summon a mighty bear and focus your aim",
      },
    },
    rollTable: [
      { roll: 1, effect: "Quick Shot", description: "Deal 2 damage to target", effectKey: "quick_shot" },
      { roll: 2, effect: "Between the Eyes", description: "Deal 2 damage, or 3 if target is below 50% HP", effectKey: "between_the_eyes" },
      { roll: 3, effect: "Aimed Shot", description: "Deal 4 damage to target", effectKey: "aimed_shot" },
      { roll: 4, effect: "Trap", description: "Deal 3 damage and apply 🟡 Slow / skip next turn", effectKey: "trap" },
      { roll: 5, effect: "Power Shot", description: "Deal 5 damage to target", effectKey: "power_shot" },
      { roll: 6, effect: "Rapid Fire", description: "Source rule incomplete. Default ruling: deal 2 damage twice, same or split target", effectKey: "rapid_fire" },
    ],
    uniqueMechanic: "Pets act immediately after Tracker. Roll d6 on pet table. Wolf has 7 HP, Bear has 5 HP. Pets persist until killed. If Tracker dies, pet fights until end of combat, then disappears.",
    abilityTrigger: "⚛️ Triggers on class-card match, once per combat unless otherwise specified",
  },

  Guardian: {
    name: "Guardian",
    baseHp: 18,
    startingGold: 40,
    startingItem: "Shield Charm",
    rank: "9",
    role: "Tank and party protector",
    specializations: {
      black: {
        name: "Sentinel",
        ability: "Gain +4 max HP (this combat only) and 3🔵 shields, each reducing 3 damage",
        desc: "Become an unbreakable fortress of steel",
      },
      red: {
        name: "Warden",
        ability: "All Heroes gain 2🔵 shields, each reducing 2 damage, lasting 3 turns",
        desc: "Shield the entire party under your guard",
      },
    },
    rollTable: [
      { roll: 1, effect: "Shield Bash", description: "Deal 1 damage and gain 1🔵", effectKey: "shield_bash" },
      { roll: 2, effect: "Defensive Stance", description: "Deal 1 damage and all allies gain 1🔵", effectKey: "defensive_stance" },
      { roll: 3, effect: "Heavy Strike", description: "Deal 3 damage", effectKey: "heavy_strike" },
      { roll: 4, effect: "Rally", description: "All allies heal 2 HP, then roll again", effectKey: "rally" },
      { roll: 5, effect: "Retribution", description: "Deal 4 damage and heal lowest HP ally 3 HP", effectKey: "retribution" },
      { roll: 6, effect: "Fortress", description: "Deal 5 damage and become immune next turn", effectKey: "fortress" },
    ],
    uniqueMechanic: "Can redirect attacks to self once per turn",
    abilityTrigger: "⚛️ Triggers on class-card match, once per combat unless otherwise specified",
  },
};

export const CLASS_RANK_MAP: Record<string, HeroClassName> = {
  "3": "Bladedancer",
  "5": "Manipulator",
  "7": "Tracker",
  "9": "Guardian",
};

export const ALL_CLASSES: HeroClassName[] = ["Bladedancer", "Manipulator", "Tracker", "Guardian"];

export function getClassForRank(rank: string): HeroClassName | undefined {
  return CLASS_RANK_MAP[rank];
}

export function getSpecialization(
  className: HeroClassName,
  suit: "clubs" | "spades" | "diamonds" | "hearts"
): string {
  const data = CLASS_DATA[className];
  const isRed = suit === "diamonds" || suit === "hearts";
  return isRed ? data.specializations.red.name : data.specializations.black.name;
}
