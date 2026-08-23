import type { AppliedRuling } from "../types/ui";

export const DEFAULT_RULINGS: AppliedRuling[] = [
  {
    id: "tracker-rapid-fire",
    rule: "Tracker Roll 6: Rapid Fire",
    issue: "Source rules list Rapid Fire but omit effect text.",
    defaultRuling:
      "Deal 2 damage twice. The Tracker may assign both hits to one valid target or split them among valid targets.",
    overrideable: true,
  },
  {
    id: "status-stun",
    rule: "Thunderstrike Stun",
    issue: "Stun appears but is not defined in named debuffs.",
    defaultRuling: "Stun causes the affected target to skip its next action.",
    overrideable: true,
  },
  {
    id: "status-illusion",
    rule: "Manipulator Illusionist — Illusion debuff",
    issue: "Illusion appears as a Manipulator debuff but is not listed in Named Debuffs initially.",
    defaultRuling: "Illusion: 2 turns, -2 to rolls. Applied to monster.",
    overrideable: true,
  },
  {
    id: "toxic-enchantment",
    rule: "Serpent's Kiss Toxic enchantment",
    issue: "Toxic is referenced but not fully defined in enchantments table.",
    defaultRuling:
      "Toxic applies Poison when the wielder deals attack damage on a natural roll of 5-6.",
    overrideable: true,
  },
  {
    id: "scaling-table-vs-formula",
    rule: "Gold and cost scaling",
    issue: "Both formulas and example tables exist for gold/cost scaling.",
    defaultRuling:
      "Use explicit table values when available. Use formulas only as fallback. Round down.",
    overrideable: true,
  },
  {
    id: "frozen-vs-freeze",
    rule: "Frost Wyrm Permafrost — Frozen vs Freeze",
    issue: "Permafrost applies 'Frozen' but named debuff is 'Freeze'.",
    defaultRuling: "Frozen is treated as Freeze debuff: must roll 4+ to act.",
    overrideable: true,
  },
  {
    id: "cyclops-boulder-position",
    rule: "Cyclops Boulder Throw targets position 4",
    issue: "In a 3-Hero party, position 4 does not exist.",
    defaultRuling: "Boulder Throw targets the last position (position 3 in a 3-Hero party).",
    overrideable: true,
  },
  {
    id: "monster-hp-scaling",
    rule: "Monster HP scaling formula",
    issue: "Formula says Base + (3 × tier number). Tier numbering starts at 1.",
    defaultRuling: "Tier 1: Base + 3. Tier 2: Base + 6. Tier 3: Base + 9. Apply exactly as written.",
    overrideable: true,
  },
  {
    id: "gold-formula-interpretation",
    rule: "Gold reward formula: Base × 1.5 ^ tier number",
    issue: "Tier 1 would give Base × 1.5^1 = Base × 1.5, but tables show Base at tier 1.",
    defaultRuling: "Use the Gold Income Table (Section 20.2) for standard values. Use formula only for monsters not in the table. Round down.",
    overrideable: true,
  },
  {
    id: "stalemate-threshold",
    rule: "Combat stalemate detection",
    issue: "Rules say environmental hazards begin after 10 rounds and stalemate causes retreat, but no exact stalemate threshold is defined.",
    defaultRuling: "After 10 rounds, if neither side has made net HP progress for 5 consecutive rounds, declare stalemate. Heroes retreat with no rewards.",
    overrideable: true,
  },
];

export function getRulingById(id: string): AppliedRuling | undefined {
  return DEFAULT_RULINGS.find((r) => r.id === id);
}
