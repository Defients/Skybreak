import type { MonsterData } from "../types/monsters";

export const MONSTERS: MonsterData[] = [
  // === Jack Monsters — Common ===
  {
    id: 1,
    name: "Abyssal Ooze",
    cardRank: "J",
    cardSuit: "clubs",
    type: "common",
    baseHp: 12,
    baseGold: 25,
    specialName: "Ooze Trail",
    specialDescription: "On match, Heroes rolling 1–2 take 1 reflect damage.",
    rollTable: [
      { roll: 1, name: "Split", effect: "gain +1 temporary APC", description: "Gain +1 temporary APC", effectKey: "split", mechanics: { gainApc: true } },
      { roll: 2, name: "Acidic Touch", effect: "deal 2 damage and destroy 1 random consumable", description: "Deal 2 damage and destroy 1 random consumable", effectKey: "acidic_touch", mechanics: { damage: 2, target: "active", destroyItem: "random" } },
      { roll: 3, name: "Engulf", effect: "deal 3 damage to Active Hero", description: "Deal 3 damage to Active Hero", effectKey: "engulf", mechanics: { damage: 3, target: "active" } },
      { roll: 4, name: "Regenerate", effect: "heal 3 HP", description: "Heal 3 HP", effectKey: "regenerate", mechanics: { heal: 3 } },
      { roll: 5, name: "Dissolve", effect: "deal 4 damage, phase through shields", description: "Deal 4 damage, phase through shields", effectKey: "dissolve", mechanics: { damage: 4, target: "active", phaseThrough: true } },
      { roll: 6, name: "Mitosis", effect: "if above 6 HP, spawn Ooze Minion with 4 HP and 1 damage/turn", description: "If above 6 HP, spawn Ooze Minion with 4 HP and 1 damage/turn", effectKey: "mitosis", mechanics: { summon: { type: "Ooze Minion", count: 1 } } },
    ],
  },
  {
    id: 2,
    name: "Treant",
    cardRank: "J",
    cardSuit: "diamonds",
    type: "common",
    baseHp: 14,
    baseGold: 25,
    specialName: "Nature's Guard",
    specialDescription: "Attackers take 1 thorn damage.",
    rollTable: [
      { roll: 1, name: "Photosynthesis", effect: "heal 4 HP", description: "Heal 4 HP", effectKey: "photosynthesis", mechanics: { heal: 4 } },
      { roll: 2, name: "Branch Whip", effect: "deal 2 damage to Active Hero", description: "Deal 2 damage to Active Hero", effectKey: "branch_whip", mechanics: { damage: 2, target: "active" } },
      { roll: 3, name: "Deep Roots", effect: "heal 2 HP and gain 1🔵", description: "Heal 2 HP and gain 1 shield", effectKey: "deep_roots", mechanics: { heal: 2, gainShields: 1 } },
      { roll: 4, name: "Entangle", effect: "deal 4 damage to Hero with most APCs", description: "Deal 4 damage to Hero with most APCs", effectKey: "entangle", mechanics: { damage: 4, target: "most_apcs" } },
      { roll: 5, name: "Nature's Wrath", effect: "deal 3 damage to all Heroes", description: "Deal 3 damage to all Heroes", effectKey: "natures_wrath", mechanics: { damage: 3, target: "all" } },
      { roll: 6, name: "Living Forest", effect: "summon 2 Saplings with 4 HP, each attacking for 1", description: "Summon 2 Saplings with 4 HP, each attacking for 1", effectKey: "living_forest", mechanics: { summon: { type: "Sapling", count: 2 } } },
    ],
  },
  {
    id: 3,
    name: "Glimmering Sprite",
    cardRank: "J",
    cardSuit: "hearts",
    type: "common",
    baseHp: 13,
    baseGold: 30,
    specialName: "Illusion Dance",
    specialDescription: "On match, teleport; next attack misses.",
    rollTable: [
      { roll: 1, name: "Sparkle", effect: "blind Active Hero, 🟡 -2 to rolls", description: "Blind Active Hero, -2 to rolls", effectKey: "sparkle", mechanics: { blindActive: true, debuffs: ["Blind"] } },
      { roll: 2, name: "Pixie Dust", effect: "deal 2 damage and steal 5g", description: "Deal 2 damage and steal 5g", effectKey: "pixie_dust", mechanics: { damage: 2, target: "active", stealGold: 5 } },
      { roll: 3, name: "Mischief", effect: "swap random APC with random Hero", description: "Swap random APC with random Hero", effectKey: "mischief", mechanics: { swapApc: true } },
      { roll: 4, name: "Glimmer", effect: "deal 3 damage to random Hero", description: "Deal 3 damage to random Hero", effectKey: "glimmer", mechanics: { damage: 3, target: "random" } },
      { roll: 5, name: "Fairy Fire", effect: "deal 4 damage and apply 🔴 Target", description: "Deal 4 damage and apply Target", effectKey: "fairy_fire", mechanics: { damage: 4, target: "active", targetToken: true } },
      { roll: 6, name: "Swarm", effect: "summon 3 Pixies with 2 HP; while alive, Heroes suffer -1 to rolls", description: "Summon 3 Pixies with 2 HP; while alive, Heroes suffer -1 to rolls", effectKey: "swarm", mechanics: { summon: { type: "Pixie", count: 3 } } },
    ],
  },
  {
    id: 4,
    name: "Shadowy Assassin",
    cardRank: "J",
    cardSuit: "spades",
    type: "common",
    baseHp: 14,
    baseGold: 35,
    specialName: "Vanish",
    specialDescription: "On match, become untargetable until rolling 1–2.",
    rollTable: [
      { roll: 1, name: "Revealed", effect: "deal 2 damage to Active Hero", description: "Deal 2 damage to Active Hero", effectKey: "revealed", mechanics: { damage: 2, target: "active" } },
      { roll: 2, name: "Quick Strike", effect: "deal 3 damage to lowest HP Hero", description: "Deal 3 damage to lowest HP Hero", effectKey: "quick_strike", mechanics: { damage: 3, target: "lowest" } },
      { roll: 3, name: "Poison Blade", effect: "deal 4 damage and apply 🟡 Poison", description: "Deal 4 damage and apply Poison", effectKey: "poison_blade", mechanics: { damage: 4, target: "active", debuffs: ["Poison"] } },
      { roll: 4, name: "Shadow Step", effect: "deal 3 damage, then automatically Vanish", description: "Deal 3 damage, then automatically Vanish", effectKey: "shadow_step", mechanics: { damage: 3, target: "active", untargetable: true } },
      { roll: 5, name: "Cheap Shot", effect: "deal 5 damage and steal highest-value item", description: "Deal 5 damage and steal highest-value item", effectKey: "cheap_shot", mechanics: { damage: 5, target: "active", stealItem: true } },
      { roll: 6, name: "Assassinate", effect: "deal 7 damage to lowest HP Hero; if this kills, Vanish", description: "Deal 7 damage to lowest HP Hero; if this kills, Vanish", effectKey: "assassinate", mechanics: { damage: 7, target: "lowest" } },
    ],
  },

  // === Queen Monsters — Uncommon ===
  {
    id: 5,
    name: "Banshee",
    cardRank: "Q",
    cardSuit: "clubs",
    type: "uncommon",
    baseHp: 15,
    baseGold: 35,
    specialName: "Wail",
    specialDescription: "On match, all Heroes take 2 unblockable damage.",
    rollTable: [
      { roll: 1, name: "Moan", effect: "deal 1 damage and apply 🟡 Fear; target cannot use items", description: "Deal 1 damage and apply Fear; target cannot use items", effectKey: "moan", mechanics: { damage: 1, target: "active", debuffs: ["Fear"], disableItems: true } },
      { roll: 2, name: "Touch of Death", effect: "deal 3 damage to Active Hero", description: "Deal 3 damage to Active Hero", effectKey: "touch_of_death", mechanics: { damage: 3, target: "active" } },
      { roll: 3, name: "Haunting Cry", effect: "next Hero skips turn and takes 2 damage", description: "Next Hero skips turn and takes 2 damage", effectKey: "haunting_cry", mechanics: { damage: 2, target: "active", skipNextTurn: true } },
      { roll: 4, name: "Phase", effect: "gain 3🔵 and deal 3 damage", description: "Gain 3 shields and deal 3 damage", effectKey: "phase", mechanics: { damage: 3, target: "active", gainShields: 3 } },
      { roll: 5, name: "Life Drain", effect: "deal 4 damage and heal 3 HP", description: "Deal 4 damage and heal 3 HP", effectKey: "life_drain", mechanics: { damage: 4, target: "active", heal: 3 } },
      { roll: 6, name: "Death Shriek", effect: "deal 5 damage to all Heroes; heal 1 HP per Hero hit", description: "Deal 5 damage to all Heroes; heal 1 HP per Hero hit", effectKey: "death_shriek", mechanics: { damage: 5, target: "all", healPerHeroHit: 1 } },
    ],
  },
  {
    id: 6,
    name: "Lunar Witch",
    cardRank: "Q",
    cardSuit: "diamonds",
    type: "uncommon",
    baseHp: 14,
    baseGold: 30,
    specialName: "Moonlight",
    specialDescription: "Below 50% HP, all attacks deal +2 damage.",
    rollTable: [
      { roll: "1-2", name: "Shadow Strike", effect: "deal 3 damage to Active Hero", description: "Deal 3 damage to Active Hero", effectKey: "shadow_strike", mechanics: { damage: 3, target: "active" } },
      { roll: 3, name: "Eclipse", effect: "deal 4 damage to Hero with fewest 🔵", description: "Deal 4 damage to Hero with fewest shields", effectKey: "eclipse", mechanics: { damage: 4, target: "fewest_shields" } },
      { roll: 4, name: "Moon Phase", effect: "heal 5 HP and gain +1 APC", description: "Heal 5 HP and gain +1 APC", effectKey: "moon_phase", mechanics: { heal: 5, gainApc: true } },
      { roll: 5, name: "Lunar Beam", effect: "deal 6 damage to Hero with most HP", description: "Deal 6 damage to Hero with most HP", effectKey: "lunar_beam", mechanics: { damage: 6, target: "highest" } },
      { roll: 6, name: "Twilight Burst", effect: "deal 4 damage to all, then fade and skip next turn", description: "Deal 4 damage to all, then fade and skip next turn", effectKey: "twilight_burst", mechanics: { damage: 4, target: "all", fadeSkipTurn: true } },
    ],
  },
  {
    id: 7,
    name: "Arcane Elemental",
    cardRank: "Q",
    cardSuit: "hearts",
    type: "uncommon",
    baseHp: 16,
    baseGold: 30,
    specialName: "Surge",
    specialDescription: "On match, next spell hits all Heroes.",
    rollTable: [
      { roll: 1, name: "Spark", effect: "deal 2 damage to Active Hero", description: "Deal 2 damage to Active Hero", effectKey: "spark", mechanics: { damage: 2, target: "active" } },
      { roll: 2, name: "Mana Burn", effect: "deal 3 damage and disable weapon for 1 turn", description: "Deal 3 damage and disable weapon for 1 turn", effectKey: "mana_burn", mechanics: { damage: 3, target: "active", disableWeapon: true } },
      { roll: 3, name: "Arcane Missiles", effect: "deal 2 damage to two different Heroes", description: "Deal 2 damage to two different Heroes", effectKey: "arcane_missiles", mechanics: { damage: 2, target: "two_different" } },
      { roll: 4, name: "Power Flux", effect: "deal 4 damage to highest HP Hero", description: "Deal 4 damage to highest HP Hero", effectKey: "power_flux", mechanics: { damage: 4, target: "highest" } },
      { roll: 5, name: "Overload", effect: "deal 5 damage and gain 1🔵", description: "Deal 5 damage and gain 1 shield", effectKey: "overload", mechanics: { damage: 5, target: "active", gainShields: 1 } },
      { roll: 6, name: "Arcane Explosion", effect: "deal 8 damage to all, including self; Heroes roll d6, 4+ avoids", description: "Deal 8 damage to all, including self; Heroes roll d6, 4+ avoids", effectKey: "arcane_explosion", mechanics: { damage: 8, target: "all", selfDamage: 8, dodgeThreshold: 4 } },
    ],
  },
  {
    id: 8,
    name: "Phoenix",
    cardRank: "Q",
    cardSuit: "spades",
    type: "uncommon",
    baseHp: 14,
    baseGold: 45,
    specialName: "Rebirth",
    specialDescription: "When killed, resurrect with 8 HP once. Each 🟢 adds +2 HP.",
    rollTable: [
      { roll: 1, name: "Ember", effect: "deal 1 damage to all Heroes", description: "Deal 1 damage to all Heroes", effectKey: "ember", mechanics: { damage: 1, target: "all" } },
      { roll: 2, name: "Flame Wing", effect: "deal 3 damage to Active Hero", description: "Deal 3 damage to Active Hero", effectKey: "flame_wing", mechanics: { damage: 3, target: "active" } },
      { roll: 3, name: "Ignite", effect: "deal 2 damage to Heroes in positions 1–2", description: "Deal 2 damage to Heroes in positions 1-2", effectKey: "ignite", mechanics: { damage: 2, target: "position", positionRange: [1, 2] } },
      { roll: 4, name: "Inferno", effect: "deal 4 damage and gain 1🟢", description: "Deal 4 damage and gain 1 counter", effectKey: "inferno", mechanics: { damage: 4, target: "active", gainCounters: 1 } },
      { roll: 5, name: "Molten Feathers", effect: "deal 2 damage and gain 2🟢", description: "Deal 2 damage and gain 2 counters", effectKey: "molten_feathers", mechanics: { damage: 2, target: "active", gainCounters: 2 } },
      { roll: 6, name: "Phoenix Storm", effect: "deal 3 damage to all and disable items for combat", description: "Deal 3 damage to all and disable items for combat", effectKey: "phoenix_storm", mechanics: { damage: 3, target: "all", disableItems: true } },
    ],
  },

  // === King Monsters — Rare ===
  {
    id: 9,
    name: "Gargoyle",
    cardRank: "K",
    cardSuit: "clubs",
    type: "rare",
    baseHp: 17,
    baseGold: 40,
    specialName: "Stone Form",
    specialDescription: "On match, immune to next 2 damage sources.",
    rollTable: [
      { roll: 1, name: "Stone Gaze", effect: "deal 2 damage and apply 🟡 Petrify", description: "Deal 2 damage and apply Petrify", effectKey: "stone_gaze", mechanics: { damage: 2, target: "active", debuffs: ["Petrify"] } },
      { roll: 2, name: "Wing Buffet", effect: "deal 3 damage to Active Hero", description: "Deal 3 damage to Active Hero", effectKey: "wing_buffet", mechanics: { damage: 3, target: "active" } },
      { roll: 3, name: "Rubble Toss", effect: "deal 2 damage to all Heroes", description: "Deal 2 damage to all Heroes", effectKey: "rubble_toss", mechanics: { damage: 2, target: "all" } },
      { roll: 4, name: "Fortify", effect: "gain 2🔵 and heal 2 HP", description: "Gain 2 shields and heal 2 HP", effectKey: "fortify", mechanics: { gainShields: 2, heal: 2 } },
      { roll: 5, name: "Crushing Blow", effect: "deal 5 damage to Active Hero", description: "Deal 5 damage to Active Hero", effectKey: "crushing_blow", mechanics: { damage: 5, target: "active" } },
      { roll: 6, name: "Earthquake", effect: "deal 4 damage to all; each Hero loses 1 APC", description: "Deal 4 damage to all; each Hero loses 1 APC", effectKey: "earthquake", mechanics: { damage: 4, target: "all", eachLoseApc: true } },
    ],
  },
  {
    id: 10,
    name: "Cursed Knight",
    cardRank: "K",
    cardSuit: "diamonds",
    type: "rare",
    baseHp: 16,
    baseGold: 35,
    specialName: "Dark Blessing",
    specialDescription: "On match, copy target's weapon ability.",
    rollTable: [
      { roll: 1, name: "Rusty Strike", effect: "deal 1 damage and apply 🟡 Poison", description: "Deal 1 damage and apply Poison", effectKey: "rusty_strike", mechanics: { damage: 1, target: "active", debuffs: ["Poison"] } },
      { roll: 2, name: "Shield Bash", effect: "deal 2 damage and gain 1🔵", description: "Deal 2 damage and gain 1 shield", effectKey: "shield_bash", mechanics: { damage: 2, target: "active", gainShields: 1 } },
      { roll: 3, name: "Cursed Blade", effect: "deal 3 damage and disable enchantment", description: "Deal 3 damage and disable enchantment", effectKey: "cursed_blade", mechanics: { damage: 3, target: "active", disableEnchantment: true } },
      { roll: 4, name: "Unholy Smite", effect: "deal 3 damage to Heroes 1–2", description: "Deal 3 damage to Heroes 1-2", effectKey: "unholy_smite", mechanics: { damage: 3, target: "position", positionRange: [1, 2] } },
      { roll: 5, name: "Life Steal", effect: "deal 4 damage and heal 3 HP", description: "Deal 4 damage and heal 3 HP", effectKey: "life_steal", mechanics: { damage: 4, target: "active", heal: 3 } },
      { roll: 6, name: "Damnation", effect: "steal weapon for combat and deal 5 damage", description: "Steal weapon for combat and deal 5 damage", effectKey: "damnation", mechanics: { damage: 5, target: "active", stealWeapon: true } },
    ],
  },
  {
    id: 11,
    name: "Minotaur",
    cardRank: "K",
    cardSuit: "hearts",
    type: "rare",
    baseHp: 18,
    baseGold: 40,
    specialName: "Maze Runner",
    specialDescription: "Below 50% HP, gain +2 to rolls and +1 damage.",
    rollTable: [
      { roll: 1, name: "Gore", effect: "deal 3 damage to Hero with most HP", description: "Deal 3 damage to Hero with most HP", effectKey: "gore", mechanics: { damage: 3, target: "highest" } },
      { roll: 2, name: "Stampede", effect: "deal 2 damage to all Heroes", description: "Deal 2 damage to all Heroes", effectKey: "stampede", mechanics: { damage: 2, target: "all" } },
      { roll: 3, name: "Bellow", effect: "heal 4 HP and gain ⚫ Might", description: "Heal 4 HP and gain Might", effectKey: "bellow", mechanics: { heal: 4, gainMight: true } },
      { roll: 4, name: "Charge", effect: "deal 4 damage and target loses next turn", description: "Deal 4 damage and target loses next turn", effectKey: "charge", mechanics: { damage: 4, target: "active", skipNextTurn: true } },
      { roll: 5, name: "Rampage", effect: "deal 3 damage to positions 2–3", description: "Deal 3 damage to positions 2-3", effectKey: "rampage", mechanics: { damage: 3, target: "position", positionRange: [2, 3] } },
      { roll: 6, name: "Labyrinth", effect: "trap Active Hero; 🟡 roll 5+ to escape, and deal 5 damage", description: "Trap Active Hero; roll 5+ to escape, and deal 5 damage", effectKey: "labyrinth", mechanics: { damage: 5, target: "active", trapHero: true } },
    ],
  },
  {
    id: 12,
    name: "Chimera",
    cardRank: "K",
    cardSuit: "spades",
    type: "rare",
    baseHp: 16,
    baseGold: 45,
    specialName: "Triple Threat",
    specialDescription: "Each match activates a different head in sequence: 1. Lion: +2 damage. 2. Goat: heal 3 HP. 3. Snake: all Heroes gain 🟡 Poison.",
    rollTable: [
      { roll: 1, name: "Goat Kick", effect: "deal 2 damage and target discards 1 APC", description: "Deal 2 damage and target discards 1 APC", effectKey: "goat_kick", mechanics: { damage: 2, target: "active", discardApc: true } },
      { roll: 2, name: "Snake Bite", effect: "deal 3 damage and apply 🟡 Poison", description: "Deal 3 damage and apply Poison", effectKey: "snake_bite", mechanics: { damage: 3, target: "active", debuffs: ["Poison"] } },
      { roll: 3, name: "Lion Roar", effect: "all Heroes gain 🟡 Fear", description: "All Heroes gain Fear", effectKey: "lion_roar", mechanics: { debuffs: ["Fear"], target: "all" } },
      { roll: 4, name: "Triple Attack", effect: "deal 2 damage to positions 1, 2, and 3", description: "Deal 2 damage to positions 1, 2, and 3", effectKey: "triple_attack", mechanics: { damage: 2, target: "position", positionRange: [1, 3] } },
      { roll: 5, name: "Flame Breath", effect: "deal 5 damage to Active Hero", description: "Deal 5 damage to Active Hero", effectKey: "flame_breath", mechanics: { damage: 5, target: "active" } },
      { roll: 6, name: "Chimeric Fury", effect: "deal 4 damage plus Poison and Fear to Active Hero", description: "Deal 4 damage plus Poison and Fear to Active Hero", effectKey: "chimeric_fury", mechanics: { damage: 4, target: "active", debuffs: ["Poison", "Fear"] } },
    ],
  },

  // === Ace Monsters — Elite ===
  {
    id: 13,
    name: "Ember Drake",
    cardRank: "A",
    cardSuit: "clubs",
    type: "elite",
    baseHp: 18,
    baseGold: 50,
    specialName: "Ignite",
    specialDescription: "On match, all attacks apply 🟡 Burn.",
    rollTable: [
      { roll: 1, name: "Smoke", effect: "all Heroes suffer -1 to next roll", description: "All Heroes suffer -1 to next roll", effectKey: "smoke", mechanics: { allMinus1Roll: true } },
      { roll: 2, name: "Claw", effect: "deal 3 damage to Active Hero", description: "Deal 3 damage to Active Hero", effectKey: "claw", mechanics: { damage: 3, target: "active" } },
      { roll: 3, name: "Fire Breath", effect: "deal 3 damage to all Heroes", description: "Deal 3 damage to all Heroes", effectKey: "fire_breath", mechanics: { damage: 3, target: "all" } },
      { roll: 4, name: "Tail Sweep", effect: "deal 4 damage and remove all 🔵", description: "Deal 4 damage and remove all shields", effectKey: "tail_sweep", mechanics: { damage: 4, target: "active", removeShields: true } },
      { roll: 5, name: "Lava Pool", effect: "deal 5 damage and create hazard, 1 damage/turn", description: "Deal 5 damage and create hazard, 1 damage/turn", effectKey: "lava_pool", mechanics: { damage: 5, target: "active", createHazard: true } },
      { roll: 6, name: "Inferno", effect: "disable all APCs and deal 3 damage per card", description: "Disable all APCs and deal 3 damage per card", effectKey: "inferno_elite", mechanics: { disableApcs: true, apcDamage: 3 } },
    ],
  },
  {
    id: 14,
    name: "Frost Wyrm",
    cardRank: "A",
    cardSuit: "diamonds",
    type: "elite",
    baseHp: 19,
    baseGold: 55,
    specialName: "Permafrost",
    specialDescription: "On match, all Heroes gain 🟡 Frozen.",
    rollTable: [
      { roll: 1, name: "Frost Breath", effect: "deal 2 damage and apply 🟡 Slow", description: "Deal 2 damage and apply Slow", effectKey: "frost_breath", mechanics: { damage: 2, target: "active", debuffs: ["Slow"] } },
      { roll: 2, name: "Ice Shards", effect: "deal 3 damage to Active Hero", description: "Deal 3 damage to Active Hero", effectKey: "ice_shards", mechanics: { damage: 3, target: "active" } },
      { roll: 3, name: "Blizzard", effect: "deal 2 damage to all and apply 🟡 Frozen", description: "Deal 2 damage to all and apply Frozen", effectKey: "blizzard", mechanics: { damage: 2, target: "all", debuffs: ["Frozen"] } },
      { roll: 4, name: "Ice Armor", effect: "gain 2🔵", description: "Gain 2 shields", effectKey: "ice_armor", mechanics: { gainShields: 2 } },
      { roll: 5, name: "Glacial Spike", effect: "deal 6 damage to frozen Heroes", description: "Deal 6 damage to frozen Heroes", effectKey: "glacial_spike", mechanics: { damage: 6, target: "frozen" } },
      { roll: 6, name: "Absolute Zero", effect: "encase Hero in ice; skip 2 turns and take 7 damage", description: "Encase Hero in ice; skip 2 turns and take 7 damage", effectKey: "absolute_zero", mechanics: { damage: 7, target: "active", skip2Turns: true } },
    ],
  },
  {
    id: 15,
    name: "Nano Prototype",
    cardRank: "A",
    cardSuit: "hearts",
    type: "elite",
    baseHp: 17,
    baseGold: 60,
    specialName: "Assimilate",
    specialDescription: "On match, all Heroes gain 🟡 Nanobot.",
    rollTable: [
      { roll: 1, name: "Nano Injection", effect: "deal 2 damage and apply 🟡 Nanobot", description: "Deal 2 damage and apply Nanobot", effectKey: "nano_injection", mechanics: { damage: 2, target: "active", debuffs: ["Nanobot"] } },
      { roll: 2, name: "System Scan", effect: "deal 3 damage to Hero with most debuffs", description: "Deal 3 damage to Hero with most debuffs", effectKey: "system_scan", mechanics: { damage: 3, target: "most_debuffs" } },
      { roll: 3, name: "Repair Protocol", effect: "heal 4 HP", description: "Heal 4 HP", effectKey: "repair_protocol", mechanics: { heal: 4 } },
      { roll: 4, name: "Virus Upload", effect: "all Heroes with 🟡 Nanobot take 3 damage", description: "All Heroes with Nanobot take 3 damage", effectKey: "virus_upload", mechanics: { nanobotDamage: 3 } },
      { roll: 5, name: "Overclock", effect: "deal 5 damage and gain +1 to next 2 rolls", description: "Deal 5 damage and gain +1 to next 2 rolls", effectKey: "overclock", mechanics: { damage: 5, target: "active", rollBonusNext2: true } },
      { roll: 6, name: "Self Destruct", effect: "remove all Nanobots, heal 2 per bot, and deal 6 damage to all", description: "Remove all Nanobots, heal 2 per bot, and deal 6 damage to all", effectKey: "self_destruct", mechanics: { damage: 6, target: "all", healPerBot: true } },
    ],
  },
  {
    id: 16,
    name: "Laser Turret",
    cardRank: "A",
    cardSuit: "spades",
    type: "elite",
    baseHp: 15,
    baseGold: 55,
    specialName: "Target Lock",
    specialDescription: "On match, apply 🔴 Target. All attacks hit marked target.",
    rollTable: [
      { roll: 1, name: "Tracking Shot", effect: "deal 4 damage to Hero with most HP", description: "Deal 4 damage to Hero with most HP", effectKey: "tracking_shot", mechanics: { damage: 4, target: "highest" } },
      { roll: 2, name: "Pulse Laser", effect: "deal 3 damage; if roll was even, hits twice", description: "Deal 3 damage; if roll was even, hits twice", effectKey: "pulse_laser", mechanics: { damage: 3, target: "active", pulseLaserTwice: true } },
      { roll: 3, name: "Shield Matrix", effect: "gain 1🔵 and heal 3 HP", description: "Gain 1 shield and heal 3 HP", effectKey: "shield_matrix", mechanics: { gainShields: 1, heal: 3 } },
      { roll: 4, name: "Overcharge", effect: "next attack deals double damage", description: "Next attack deals double damage", effectKey: "overcharge", mechanics: { overcharge: true } },
      { roll: 5, name: "Beam Sweep", effect: "deal 5 damage to target and 2 to others", description: "Deal 5 damage to target and 2 to others", effectKey: "beam_sweep", mechanics: { beamSweep: { primary: 5, secondary: 2 } } },
      { roll: 6, name: "Orbital Strike", effect: "choose Hero, deal 10 damage; target dodges only on d6 roll of 6", description: "Choose Hero, deal 10 damage; target dodges only on d6 roll of 6", effectKey: "orbital_strike", mechanics: { damage: 10, target: "active", dodgeExact: true, dodgeThreshold: 6 } },
    ],
  },

  // === Mini-Boss Monsters ===
  {
    id: 17,
    name: "Behemoth",
    cardRank: "MB",
    cardSuit: "none",
    type: "miniboss",
    baseHp: 25,
    baseGold: 100,
    specialName: "Colossal",
    specialDescription: "All incoming damage reduced by 2. Immune to debuffs.",
    rollTable: [
      { roll: "1-2", name: "Stomp", effect: "deal 4 damage to all Heroes", description: "Deal 4 damage to all Heroes", effectKey: "stomp", mechanics: { damage: 4, target: "all" } },
      { roll: 3, name: "Devour", effect: "deal 7 damage to lowest HP Hero", description: "Deal 7 damage to lowest HP Hero", effectKey: "devour", mechanics: { damage: 7, target: "lowest" } },
      { roll: 4, name: "Regenerate", effect: "heal 5 HP", description: "Heal 5 HP", effectKey: "regenerate_mb", mechanics: { heal: 5 } },
      { roll: 5, name: "Rampage", effect: "deal 5 damage to two random Heroes", description: "Deal 5 damage to two random Heroes", effectKey: "rampage", mechanics: { damage: 5, target: "two_random" } },
      { roll: 6, name: "Titan's Wrath", effect: "instant kill if Hero has below 8 HP; otherwise deal 10 damage", description: "Instant kill if Hero has below 8 HP; otherwise deal 10 damage", effectKey: "titans_wrath", mechanics: { damage: 10, target: "lowest", instantKillBelowHp: 8 } },
    ],
  },
  {
    id: 18,
    name: "Cyclops",
    cardRank: "MB",
    cardSuit: "none",
    type: "miniboss",
    baseHp: 22,
    baseGold: 100,
    specialName: "One Eye",
    specialDescription: "+3 to hit rolls. Heroes can dodge on natural 6.",
    rollTable: [
      { roll: 1, name: "Club Swing", effect: "deal 3 damage to positions 1–2", description: "Deal 3 damage to positions 1-2", effectKey: "club_swing", mechanics: { damage: 3, target: "position", positionRange: [1, 2] } },
      { roll: 2, name: "Boulder Throw", effect: "deal 5 damage to position 4", description: "Deal 5 damage to position 3 (last position in 3-hero party)", effectKey: "boulder_throw", mechanics: { damage: 5, target: "position", positionRange: [3, 3] } },
      { roll: 3, name: "Intimidate", effect: "all Heroes gain 🟡 Fear", description: "All Heroes gain Fear", effectKey: "intimidate", mechanics: { debuffs: ["Fear"], target: "all" } },
      { roll: 4, name: "Focus Gaze", effect: "next attack cannot be dodged", description: "Next attack cannot be dodged", effectKey: "focus_gaze", mechanics: { focusGaze: true } },
      { roll: 5, name: "Grab", effect: "deal 6 damage and Hero loses next turn", description: "Deal 6 damage and Hero loses next turn", effectKey: "grab", mechanics: { damage: 6, target: "active", skipNextTurn: true } },
      { roll: 6, name: "Death Ray", effect: "deal 12 damage to target; target dodges on d6 roll of 5+", description: "Deal 12 damage to target; target dodges on d6 roll of 5+", effectKey: "death_ray", mechanics: { damage: 12, target: "active", dodgeThreshold: 5 } },
    ],
  },
  {
    id: 19,
    name: "Dragon",
    cardRank: "MB",
    cardSuit: "none",
    type: "miniboss",
    baseHp: 24,
    baseGold: 125,
    specialName: "Ancient",
    specialDescription: "+1 to all rolls per tier reached.",
    rollTable: [
      { roll: 1, name: "Tail Whip", effect: "deal 3 damage to all Heroes", description: "Deal 3 damage to all Heroes", effectKey: "tail_whip", mechanics: { damage: 3, target: "all" } },
      { roll: 2, name: "Bite", effect: "deal 5 damage and steal 1 item", description: "Deal 5 damage and steal 1 item", effectKey: "bite", mechanics: { damage: 5, target: "active", stealItem: true } },
      { roll: 3, name: "Dragon Fear", effect: "all Heroes lose next turn", description: "All Heroes lose next turn", effectKey: "dragon_fear", mechanics: { allLoseNextTurn: true } },
      { roll: 4, name: "Flame Breath", effect: "deal 6 damage to positions 2–3", description: "Deal 6 damage to positions 2-3", effectKey: "dragon_flame_breath", mechanics: { damage: 6, target: "position", positionRange: [2, 3] } },
      { roll: 5, name: "Fly", effect: "become untargetable next turn and heal 4 HP", description: "Become untargetable next turn and heal 4 HP", effectKey: "fly", mechanics: { untargetableNextTurn: true, heal: 4 } },
      { roll: 6, name: "Apocalypse", effect: "deal 8 damage to all and destroy all items", description: "Deal 8 damage to all and destroy all items", effectKey: "apocalypse", mechanics: { damage: 8, target: "all", destroyItem: "all" } },
    ],
  },
  {
    id: 20,
    name: "Titan",
    cardRank: "MB",
    cardSuit: "none",
    type: "miniboss",
    baseHp: 23,
    baseGold: 100,
    specialName: "Unyielding",
    specialDescription: "Below 50% HP, heal 2 HP at turn start.",
    rollTable: [
      { roll: 1, name: "Fist", effect: "deal 4 damage to Active Hero", description: "Deal 4 damage to Active Hero", effectKey: "fist", mechanics: { damage: 4, target: "active" } },
      { roll: 2, name: "Shockwave", effect: "deal 3 damage to all Heroes", description: "Deal 3 damage to all Heroes", effectKey: "shockwave", mechanics: { damage: 3, target: "all" } },
      { roll: 3, name: "Battle Cry", effect: "gain ⚫ Might", description: "Gain Might", effectKey: "battle_cry", mechanics: { gainMight: true } },
      { roll: 4, name: "Grab", effect: "deal 5 damage and throw target at position 1, dealing 3 damage", description: "Deal 5 damage and throw target at position 1, dealing 3 damage", effectKey: "titan_grab", mechanics: { damage: 5, target: "active", throwPosition1: true } },
      { roll: 5, name: "Restore", effect: "heal 8 HP", description: "Heal 8 HP", effectKey: "restore", mechanics: { heal: 8 } },
      { roll: 6, name: "Titan's Grip", effect: "grab Hero, deal 7 damage, and disable for 2 turns", description: "Grab Hero, deal 7 damage, and disable for 2 turns", effectKey: "titans_grip", mechanics: { damage: 7, target: "active", disableFor2Turns: true } },
    ],
  },

  // === Final Boss ===
  {
    id: 21,
    name: "Vyridian, the Astril Conductor",
    cardRank: "FB",
    cardSuit: "none",
    type: "finalBoss",
    baseHp: 35,
    baseGold: 0,
    specialName: "Astril Conductor",
    specialDescription: "No tier scaling. 4 APCs. Three phases.",
    rollTable: [
      { roll: 1, name: "Star Bolt", effect: "deal 3 damage to Active Hero", description: "Deal 3 damage to Active Hero", effectKey: "star_bolt", mechanics: { damage: 3, target: "active" } },
      { roll: 2, name: "Cosmic Shield", effect: "gain 2🔵", description: "Gain 2 shields", effectKey: "cosmic_shield", mechanics: { gainShields: 2 } },
      { roll: 3, name: "Void Touch", effect: "deal 4 damage and disable item", description: "Deal 4 damage and disable item", effectKey: "void_touch", mechanics: { damage: 4, target: "active", disableItem: true } },
      { roll: 4, name: "Astril Chains", effect: "deal 3 damage and Hero loses turn", description: "Deal 3 damage and Hero loses turn", effectKey: "astril_chains", mechanics: { damage: 3, target: "active", skipNextTurn: true } },
      { roll: 5, name: "Star Storm", effect: "deal 2 damage to all Heroes", description: "Deal 2 damage to all Heroes", effectKey: "star_storm", mechanics: { damage: 2, target: "all" } },
      { roll: 6, name: "Nova Burst", effect: "deal 5 damage to all and Vyridian restores 3 HP", description: "Deal 5 damage to all and Vyridian restores 3 HP", effectKey: "nova_burst", mechanics: { damage: 5, target: "all", restoreHp: 3 } },
    ],
    phases: [
      {
        name: "Phase 1 — The Measure",
        hpRange: "35-26",
        effects: ["Base roll table"],
      },
      {
        name: "Phase 2 — The Conduction",
        hpRange: "25-16",
        effects: ["Gains +2 to all rolls", "Immune to debuffs", "Roll 6 becomes Black Hole: deal 6 damage to all and remove all shields"],
        rollOverrides: [
          { roll: 6, name: "Black Hole", effect: "deal 6 damage to all and remove all shields", description: "Deal 6 damage to all and remove all shields", effectKey: "black_hole", mechanics: { damage: 6, target: "all", removeShields: true } },
        ],
      },
      {
        name: "Phase 3 — The Harmonic Trial",
        hpRange: "15-0",
        effects: ["Acts twice per turn", "All attacks deal +1 damage", "Roll 6 becomes Reality Break: deal 8 damage to all and shuffle all APCs"],
        rollOverrides: [
          { roll: 6, name: "Reality Break", effect: "deal 8 damage to all and shuffle all APCs", description: "Deal 8 damage to all and shuffle all APCs", effectKey: "reality_break", mechanics: { damage: 8, target: "all", shuffleApcs: true } },
        ],
      },
    ],
  },
];

export function getMonsterByCard(rank: string, suit: string): MonsterData | undefined {
  return MONSTERS.find((m) => m.cardRank === rank && m.cardSuit === suit);
}

export function getMonsterById(id: number): MonsterData | undefined {
  return MONSTERS.find((m) => m.id === id);
}

export function getMiniBosses(): MonsterData[] {
  return MONSTERS.filter((m) => m.type === "miniboss");
}

export function getFinalBoss(): MonsterData {
  return MONSTERS.find((m) => m.type === "finalBoss")!;
}

export function getVyridianPhase(hp: number): number {
  if (hp >= 26) return 1;
  if (hp >= 16) return 2;
  return 3;
}

export function getVyridianPhaseData(hp: number) {
  const boss = getFinalBoss();
  if (!boss.phases) return null;
  const phaseNum = getVyridianPhase(hp);
  return boss.phases[phaseNum - 1];
}

export const SUMMON_DATA: Record<string, { name: string; hp: number; damage: number; type: string; description: string }> = {
  "Ooze Minion": { name: "Ooze Minion", hp: 4, damage: 1, type: "summon", description: "A splitting ooze that deals 1 damage per turn to the lowest HP hero." },
  "Sapling": { name: "Sapling", hp: 4, damage: 1, type: "summon", description: "A young plant summoned by the Treant. Deals 1 damage per turn to the lowest HP hero." },
  "Pixie": { name: "Pixie", hp: 2, damage: 0, type: "summon", description: "A mischievous fairy. While alive, all Heroes suffer -1 to their rolls." },
};

export const WOLF_TABLE = [
  { roll: "1-3", name: "Bite", effect: "deal 2 damage", description: "Deal 2 damage", effectKey: "wolf_bite", mechanics: { damage: 2, target: "active" } },
  { roll: "4-5", name: "Fierce Bite", effect: "deal 3 damage", description: "Deal 3 damage", effectKey: "wolf_fierce_bite", mechanics: { damage: 3, target: "active" } },
  { roll: 6, name: "Alpha Strike", effect: "deal 4 damage and heal Tracker 2 HP", description: "Deal 4 damage and heal Tracker 2 HP", effectKey: "wolf_alpha_strike", mechanics: { damage: 4, target: "active" } },
];

export const BEAR_TABLE = [
  { roll: "1-2", name: "Swipe", effect: "deal 1 damage and Hero 1 gains 1🔵", description: "Deal 1 damage and Hero 1 gains 1 shield", effectKey: "bear_swipe", mechanics: { damage: 1, target: "active", gainShields: 1 } },
  { roll: "3-5", name: "Maul", effect: "deal 3 damage", description: "Deal 3 damage", effectKey: "bear_maul", mechanics: { damage: 3, target: "active" } },
  { roll: 6, name: "Crushing Hug", effect: "deal 5 damage", description: "Deal 5 damage", effectKey: "bear_crushing_hug", mechanics: { damage: 5, target: "active" } },
];
