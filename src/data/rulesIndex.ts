import type { RuleSection } from "../types/ui";

export const RULES_INDEX: RuleSection[] = [
  {
    id: "core-definitions",
    title: "Core Definitions",
    section: "1",
    content: "Key terms: Active Hero, APC, Match, Party, Phase Through, Position, Random, Stack, Untargetable. A Match occurs when a flipped Peon card's rank equals an attached APC rank. Random is determined by d6 assignment. Party is all living Heroes.",
    keywords: ["APC", "Match", "Party", "Position", "Random", "Stack"],
  },
  {
    id: "token-system",
    title: "Token System",
    section: "2",
    content: "Six token types: 🔵 Shield (reduces damage, max 5), 🔴 Target (+1 damage taken, max 1, 3 turns), ⚫ Buff (named positive, max 3), 🟡 Debuff (named negative, max 3), 🟢 Counter (tracks value, max 6, permanent), ⚪ Special (unique, max 1). Named Buffs: Haste, Might, Focus, Regeneration. Named Debuffs: Poison, Freeze, Fear, Slow, Petrify, Burn, Nanobot, Illusion, Stun.",
    keywords: ["Token", "Shield", "Target", "Buff", "Debuff", "Counter", "Special", "Poison", "Freeze", "Fear", "Burn", "Stun"],
  },
  {
    id: "priority-timing",
    title: "Priority, Timing, and Resolution",
    section: "3",
    content: "Priority Selection: 1) Highest/Lowest HP as specified, 2) Most/Fewest Tokens, 3) Lowest Hero ID / Highest Monster ID, 4) d6 roll. Timing: Immediate, Start of Turn, End of Turn, Start/End of Combat, Once per Combat, Persistent. Resolution priority: Monster Special > Hero Ability > Weapon > Environment > Enchantment > Token > Base.",
    keywords: ["APC", "Match", "Damage", "Token", "Priority", "Timing"],
  },
  {
    id: "deck-division",
    title: "Deck Division",
    section: "4.2",
    content: "Royalty Deck: J/Q/K/A of all suits (16 cards). Peon Deck: 2-10 of all suits (36 cards). Joker Cards: 2 Jokers (Major Health Potions). Environment Deck: 4 cards, one of each suit, from unused Hero Royalty. Card Hierarchy: A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3 > 2.",
    keywords: ["APC", "Deck", "Card", "Environment"],
  },
  {
    id: "hero-creation",
    title: "Hero Creation",
    section: "5.1",
    content: "Separate Peon cards by rank 3/5/7/9, shuffle each pile, draw one from each. Rank determines class: 3=Bladedancer(16HP), 5=Manipulator(17HP), 7=Tracker(16HP), 9=Guardian(18HP). Suit determines specialization: Black=first spec, Red=second spec. Choose 3 classes for party; 4th becomes Environment Deck source.",
    keywords: ["Hero", "Class", "Specialization", "Setup"],
  },
  {
    id: "starting-resources",
    title: "Starting Resources",
    section: "5.2",
    content: "Each Hero starts with 40g and a class-specific starting item. Each Hero begins with a Common weapon. Total party gold: 120g for 3 Heroes. Welcome Bonus: roll 2d6. 2-5=20g, 6-8=Common weapon, 9-10=Common weapon+20g, 11-12=Rare weapon.",
    keywords: ["Gold", "Item", "Weapon", "Setup"],
  },
  {
    id: "game-structure",
    title: "Game Structure — The Astrilith",
    section: "6",
    content: "3 Tiers. Tier 1 (Foundation): 10 rooms. Tier 2 (Ascent): 12 rooms. Tier 3 (Summit): 10 rooms. Room types: ♦️ Wayfarer's Exchange (merchant), ♣️ Encounter (combat), ❤️ Sanctuary Landing (rest), ♠️ Elite Encounter, 🌟 Trial Chamber (mini-boss), 🏰 Vyridian's Judgment (final confrontation), X/Y Split path.",
    keywords: ["Boss", "Merchant", "Rest", "Environment", "Tier"],
  },
  {
    id: "room-types",
    title: "Room Types",
    section: "7",
    content: "Wayfarer's Exchange (merchant): shop, no combat. Encounter (combat): one standard monster. Sanctuary Landing (rest): choose full heal / revive+heal / gold (2d6×10×tier) / +2 max HP. Elite Encounter: +5 HP, +1 APC, elite loot. Trial Chamber (mini-boss): unique monster, guaranteed Rare+ weapon, bonus gold 100g×tier. Vyridian's Judgment (final confrontation): survive it to win the run.",
    keywords: ["Merchant", "Rest", "Boss", "Combat", "Elite"],
  },
  {
    id: "combat-structure",
    title: "Combat Structure",
    section: "9",
    content: "Setup: reveal monster, assign APCs, apply environment. Round: monster turn → hero turns (chosen order, locked) → summon turns → end round → check victory/defeat. Cleanup: remove temp effects, collect rewards. Monsters always act first.",
    keywords: ["Combat", "APC", "Match", "Damage", "Death"],
  },
  {
    id: "combat-setup",
    title: "Combat Setup",
    section: "10",
    content: "Monster Reveal: draw top Royalty card, determine monster, apply tier scaling (Base HP + 3×tier), set HP. APC Assignment: shuffle Peon deck, each Hero draws 1 APC, monster draws 2 APCs (+1 for elite, 4 for final boss). Reshuffle if 4+ same rank. Environment: flip top Environment card, apply for entire combat.",
    keywords: ["APC", "Combat", "Environment", "Monster"],
  },
  {
    id: "environment-effects",
    title: "Environment Effects",
    section: "10.3",
    content: "♣️ Training Ground: no effect. ♦️ Library: all entities +1 APC. ❤️ Armory: Heroes +2 to first roll, Monster +1 to first 3 rolls. ♠️ Elemental Chamber: Black specs +1 to all rolls, Red specs +1 APC.",
    keywords: ["Environment", "APC", "Combat"],
  },
  {
    id: "match-system",
    title: "Match System",
    section: "12",
    content: "Match: flipped Peon card rank equals APC rank. Check after both cards flipped. One trigger per APC per flip. Single Match: one card matches one APC → trigger ability. Double Match: both cards match different APCs → trigger both, +1 damage. Set Match: both cards match same APC → +1 to next roll. Chain Match: 3+ consecutive matches → +2 to next roll.",
    keywords: ["Match", "APC", "Damage"],
  },
  {
    id: "damage-calculation",
    title: "Damage Calculation",
    section: "13",
    content: "Base + Weapon + Enchantment + Tokens + Environment + Matches - Shields - Armor - Defense = Final Damage. Minimum 0. Phase-through ignores shields, armor, and damage reduction.",
    keywords: ["Damage", "Shield", "Token", "Environment", "Match"],
  },
  {
    id: "death-revival",
    title: "Death and Revival",
    section: "14",
    content: "Hero at 0 HP is dead. Dead Heroes: removed from targeting, keep position for revival, skip turns, cannot vote, not party members, lose all tokens except 🟢 Counters. Revival: return to same position, restore HP as specified, may act on future turns. Healing cannot revive unless effect says 'revive'.",
    keywords: ["Death", "Token", "Revive"],
  },
  {
    id: "classes",
    title: "Classes and Abilities",
    section: "15",
    content: "Bladedancer (16HP): fast strikes, combo chains. Manipulator (17HP): mind control, temporal. Tracker (16HP): pet companion, ranged. Guardian (18HP): tank, protector. Each class has specializations, roll table (d6), and unique mechanic. ⚛️ ability triggers on class-card match, once per combat.",
    keywords: ["Hero", "Class", "Ability", "Combat"],
  },
  {
    id: "weapons",
    title: "Weapons",
    section: "16",
    content: "One weapon per Hero, class-specific. Rarity: Common (50g), Rare (100g, +50 upgrade), Epic (200g, Tier 2+, +100 upgrade), Legendary (400g, Tier 3, +200 upgrade). Upgrading keeps enchantments. Slot-free enchantments don't count against limit.",
    keywords: ["Weapon", "Item", "Merchant"],
  },
  {
    id: "enchantments",
    title: "Enchantments",
    section: "17",
    content: "One enchantment per weapon unless slot-free. Applied at Merchant, cannot be removed only replaced. 9 enchantments: Swift, Mighty, Vampiric, Explosive, Precise, Defensive, Ethereal, Chaotic, Divine. Chaotic: roll d6 each attack for random effect.",
    keywords: ["Weapon", "Merchant", "Item"],
  },
  {
    id: "monsters",
    title: "Monsters",
    section: "18",
    content: "HP scales: Base + 3×tier. Gold scales: Base × 1.5^tier (round down). Jack=Common, Queen=Uncommon, King=Rare, Ace=Elite. Special abilities trigger on match. 4 Mini-Bosses: Behemoth, Cyclops, Dragon, Titan. Final confrontation: Vyridian (35 HP, 4 APCs, 3 phases).",
    keywords: ["Monster", "Boss", "Combat", "APC", "Match"],
  },
  {
    id: "final-boss",
    title: "The Final Confrontation — Vyridian",
    section: "19",
    content: "HP: 35, no tier scaling, 4 APCs. Phase 1 (35-26): The Measure, base table. Phase 2 (25-16): The Conduction, +2 to rolls, immune to debuffs, Roll 6=Black Hole. Phase 3 (15-0): The Harmonic Trial, acts twice per turn, +1 damage, Roll 6=Reality Break. Surviving the judgment awards title 'Ascendant Champions'.",
    keywords: ["Boss", "Combat", "Victory"],
  },
  {
    id: "progression-scaling",
    title: "Progression and Scaling",
    section: "20",
    content: "Tier transitions: full heal, +2 max HP, merchant prices +50%, monster rewards +50%, clear temp effects. Gold Income Table by tier. Scaling: Monster HP = Base + 3×tier. Gold = Base × 1.5^tier. Item costs = Base × (1 + 0.5×tier). Round down.",
    keywords: ["Tier", "Gold", "Merchant", "Monster"],
  },
  {
    id: "victory-defeat",
    title: "Victory and Defeat",
    section: "21",
    content: "Victory: Vyridian's judgment survived (HP reduced to 0) AND at least one Hero survives. Defeat: all Heroes reach 0 HP. Score: 1000 base + Heroes alive×1000 + Gold×10 + Tier3 rooms×100 - Turns×50 + Items retained×200 + Perfect combats×500. New Game+: keep 1 item, monsters +2 HP, Welcome Bonus only.",
    keywords: ["Victory", "Death", "Boss", "Score"],
  },
  {
    id: "merchant-inventory",
    title: "Merchant and Inventory",
    section: "22",
    content: "Each Hero: 3 item slots + weapon. Jokers = Major Potions, use slots. Permanent upgrades don't count against limit. Party: 2 shared slots. Over-capacity resolved before leaving. Items sell for 25%. Healing services, consumables, permanent upgrades, weapon services all available.",
    keywords: ["Merchant", "Item", "Gold", "Weapon"],
  },
  {
    id: "difficulty-variants",
    title: "Difficulty Variants",
    section: "27",
    content: "Easy: 150g start, +2 HP, revival -50%, monsters -2 HP. Hard: 80g start, no Welcome weapons, monsters +1 to rolls, permanent death. Nightmare: 40g start, monsters get tier bonuses, items +50%, lose 25% gold on death, must reach and survive Vyridian in 40 turns.",
    keywords: ["Difficulty", "Death", "Gold", "Boss"],
  },
  {
    id: "ai-decisions",
    title: "AI Decision Trees",
    section: "28",
    content: "Hero targeting: kill if possible → target marked → lowest HP → most APCs → highest ID. Monster targeting: Active Hero → lowest HP → most tokens → lowest ID → d6. Defensive items: Guardian Angel on lethal, potions below 35%, shields before big damage. Offensive items: Bomb for kills, Power Scroll for lethal.",
    keywords: ["Combat", "Damage", "Death", "Item"],
  },
];

export function searchRules(query: string): RuleSection[] {
  const lower = query.toLowerCase();
  return RULES_INDEX.filter((rule) => {
    return (
      rule.title.toLowerCase().includes(lower) ||
      rule.content.toLowerCase().includes(lower) ||
      rule.keywords.some((k) => k.toLowerCase().includes(lower))
    );
  });
}

export function getRuleBySection(section: string): RuleSection | undefined {
  return RULES_INDEX.find((r) => r.section === section);
}

export const RULE_KEYWORDS = [
  "APC",
  "Match",
  "Damage",
  "Death",
  "Merchant",
  "Token",
  "Boss",
  "Rest",
  "Environment",
  "Combat",
  "Elite",
  "Weapon",
  "Enchantment",
  "Item",
  "Gold",
  "Tier",
  "Hero",
  "Class",
  "Monster",
  "Victory",
  "Score",
  "Difficulty",
  "Shield",
  "Poison",
  "Freeze",
  "Fear",
  "Burn",
  "Stun",
  "Setup",
  "Priority",
  "Ability",
];
