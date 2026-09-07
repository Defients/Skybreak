export interface StrategySection {
  id: string;
  category: string;
  title: string;
  icon: string;
  content: StrategyBlock[];
}

export interface StrategyBlock {
  type: "heading" | "paragraph" | "list" | "table" | "tip" | "warning";
  text?: string;
  items?: string[];
  headers?: string[];
  rows?: string[][];
}

export const STRATEGY_SECTIONS: StrategySection[] = [
  // ─────────────────────────────────────────────────────────────
  // PARTY COMPOSITION
  // ─────────────────────────────────────────────────────────────
  {
    id: "party-composition",
    category: "Party Composition",
    title: "Building Your Party",
    icon: "🛡️",
    content: [
      {
        type: "paragraph",
        text: "You choose 3 of the 4 available classes for your party. The 4th class becomes the Environment Deck source. Your composition determines your playstyle for the entire run — choose carefully.",
      },
      {
        type: "heading",
        text: "Class Roles at a Glance",
      },
      {
        type: "table",
        headers: ["Class", "HP", "Role", "Key Strength"],
        rows: [
          ["Bladedancer", "16", "DPS / Assassin", "High burst damage, combo chains, execute kills"],
          ["Manipulator", "17", "Control / Support", "Mind control, healing, debuff application"],
          ["Tracker", "16", "Ranged DPS / Summoner", "Pet companion, consistent ranged damage, gold generation"],
          ["Guardian", "18", "Tank / Protector", "Shields, party healing, damage redirection"],
        ],
      },
      {
        type: "heading",
        text: "Recommended Compositions",
      },
      {
        type: "list",
        items: [
          "Balanced (Bladedancer + Manipulator + Guardian): The safest comp. Bladedancer kills, Manipulator controls and heals, Guardian tanks. Covers all bases and is forgiving for new players.",
          "Aggressive (Bladedancer + Tracker + Guardian): Double DPS with a tank. Tracker's pet adds extra damage per round. Manipulator's control is replaced by raw damage output.",
          "Control (Manipulator + Tracker + Guardian): Slow but steady. Manipulator disrupts monsters, Tracker provides sustained ranged damage, Guardian keeps everyone alive. Excellent for boss fights.",
          "Glass Cannon (Bladedancer + Manipulator + Tracker): Maximum damage, minimal defense. High risk — relies on killing monsters before they can threaten you. Best for experienced players on Normal.",
        ],
      },
      {
        type: "heading",
        text: "Position Strategy",
      },
      {
        type: "paragraph",
        text: "Position 1 is typically targeted first by monsters (lowest HP priority). Place your Guardian in position 1 to absorb hits, or your Bladedancer if you want them targeted for execute opportunities. Position 3 is safest — ideal for Manipulator or Tracker.",
      },
      {
        type: "tip",
        text: "The Environment Deck is built from the unused class's Royalty cards. Dropping Guardian means no Armory environment; dropping Manipulator means no Library. Consider which environment effects you want available when choosing your 4th class.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // CLASSEDANCER GUIDE
  // ─────────────────────────────────────────────────────────────
  {
    id: "class-bladedancer",
    category: "Class Guides",
    title: "Bladedancer",
    icon: "⚔️",
    content: [
      {
        type: "paragraph",
        text: "16 HP assassin-class DPS. Excels at burst damage and finishing low-HP targets. Combo chains grant cumulative +1 damage, making consecutive attacks increasingly lethal.",
      },
      {
        type: "heading",
        text: "Roll Table Analysis",
      },
      {
        type: "table",
        headers: ["Roll", "Ability", "Notes"],
        rows: [
          ["1", "Quick Strike (2 dmg)", "Reliable baseline — never truly wasted"],
          ["2", "Dodge (1 dmg + 1 shield)", "Defensive option, good vs hard-hitting monsters"],
          ["3", "Precision (3 dmg, 4 with buff)", "Solid damage, benefits from any active buff"],
          ["4", "Eviscerate (3 dmg + reroll)", "Potential for huge combo — reroll on 5-6 crits for double"],
          ["5", "Execute (4 dmg, instakill ≤5 HP)", "Best finisher in the game — save for low-HP targets"],
          ["6", "Blade Dance (3 dmg + 2 rerolls)", "Highest damage ceiling with lucky rerolls"],
        ],
      },
      {
        type: "heading",
        text: "Specializations",
      },
      {
        type: "list",
        items: [
          "Shadowblade (Black): Steals an enemy APC permanently and gains 2 shields (each reducing 2 damage). Excellent vs monsters with strong APCs — denies their match triggers while boosting your own. Best vs Elite/Boss monsters.",
          "Runeblade (Red): Next 3 attacks deal +2 damage with Might buff. Pure offensive choice. Synergizes with combo chains — each boosted attack gets the +2 on top of combo bonuses. Best for burst windows.",
        ],
      },
      {
        type: "heading",
        text: "Weapon Progression",
      },
      {
        type: "list",
        items: [
          "Common: Swift Blade (reroll 1s) or Sharp Dagger (+1 on 5-6). Swift Blade is more consistent; Sharp Dagger rewards high rolls.",
          "Rare: Frostbite Dagger (reroll on 1-2, Freeze on 1-3) for control, or Serpent's Kiss (free Toxic enchant) for poison stacking.",
          "Epic: Moonshadow Shiv (stealth on 1-4, +3 burst on 5-6) for survivability, or Voidcutter (phase through shields) vs shield-heavy enemies.",
          "Legendary: Starforged Blade (+1 all damage, dual specs) is the dream — unlocks both Shadowblade and Runeblade. Edge of Eclipse (every 3rd attack double) for sustained fights.",
        ],
      },
      {
        type: "tip",
        text: "Execute (roll 5) is your signature move. Track monster HP and time your turn so Execute lands when the target is at 5 HP or below. With Fyrizal on your Guardian, the threshold extends to 7 HP.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // MANIPULATOR GUIDE
  // ─────────────────────────────────────────────────────────────
  {
    id: "class-manipulator",
    category: "Class Guides",
    title: "Manipulator",
    icon: "🔮",
    content: [
      {
        type: "paragraph",
        text: "17 HP control/support hybrid. Can redirect monster attacks, heal allies, and disrupt enemies with debuffs. The most versatile class — valuable in every composition.",
      },
      {
        type: "heading",
        text: "Roll Table Analysis",
      },
      {
        type: "table",
        headers: ["Roll", "Ability", "Notes"],
        rows: [
          ["1", "Mind Spike (2 dmg)", "Baseline — improved to 3 with Crystal Wand"],
          ["2", "Mind Flay (1 dmg, reroll if even)", "Gambling roll — can chain for massive damage with luck"],
          ["3", "Psychic Drain (3 dmg + 1 heal)", "Self-sustain, great for long fights"],
          ["4", "Telekinesis (2-4 dmg)", "Inconsistent but improved by Astril Rod (3-5 dmg)"],
          ["5", "Mind Control (4 dmg to self)", "Forces monster to damage itself — bypasses shields"],
          ["6", "Psionic Storm (5 dmg + party heal 1)", "Best support roll — damage + party-wide healing"],
        ],
      },
      {
        type: "heading",
        text: "Specializations",
      },
      {
        type: "list",
        items: [
          "Timebender (Black): Take an extra turn immediately and heal 3 HP. Essentially a free action with healing. Incredibly strong — the extra turn means another roll, another potential match, another chance at a 6.",
          "Illusionist (Red): Apply Illusion to monster for 2 turns (-2 to all rolls). Devastating against bosses — reducing a boss's rolls by 2 across multiple turns can prevent their special abilities entirely.",
        ],
      },
      {
        type: "heading",
        text: "Weapon Progression",
      },
      {
        type: "list",
        items: [
          "Common: Crystal Wand (Mind Spike → 3 dmg) for consistent damage, or Scholar's Staff (+1 temp APC) for more match opportunities.",
          "Rare: Astril Rod (Telekinesis 3-5 dmg) makes roll 4 reliable, or Aetherpulse (confused enemies take 1/turn) for passive damage.",
          "Epic: Celestial Scepter (Psychic Drain heals 3, can target allies) for party healing, or Void Staff (Mind Control hits all debuffed enemies) for AoE control.",
          "Legendary: Eternal Starweaver (dual specs, Psionic Storm heals 3) is the ultimate support weapon. Reality Anchor (force any die reroll once per turn) is incredibly disruptive.",
        ],
      },
      {
        type: "tip",
        text: "Mind Control (roll 5) forces the monster to damage itself, bypassing shields and armor. Save this for shielded or high-defense targets. With Void Staff, it hits ALL debuffed enemies — combo with Illusionist spec for massive AoE.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // TRACKER GUIDE
  // ─────────────────────────────────────────────────────────────
  {
    id: "class-tracker",
    category: "Class Guides",
    title: "Tracker",
    icon: "🏹",
    content: [
      {
        type: "paragraph",
        text: "16 HP ranged DPS with a pet companion. Pets act immediately after the Tracker, effectively giving you two actions per turn. The most consistent damage dealer over a full run.",
      },
      {
        type: "heading",
        text: "Roll Table Analysis",
      },
      {
        type: "table",
        headers: ["Roll", "Ability", "Notes"],
        rows: [
          ["1", "Quick Shot (2 dmg)", "Reliable baseline"],
          ["2", "Between the Eyes (2-3 dmg)", "Bonus damage vs low-HP targets — execute-adjacent"],
          ["3", "Aimed Shot (4 dmg)", "Excellent consistent damage — triggers on 3+ with Sturdy Crossbow"],
          ["4", "Trap (3 dmg + Slow)", "Control option — skips enemy's next turn"],
          ["5", "Power Shot (5 dmg)", "Highest single-hit base damage in the game"],
          ["6", "Rapid Fire (2 dmg x2)", "Flexible — split or focus. Good for clearing summons"],
        ],
      },
      {
        type: "heading",
        text: "Specializations",
      },
      {
        type: "list",
        items: [
          "Huntmaster (Black): Apply Target token (+1 damage taken) to enemy and summon a Wolf pet (7 HP). Wolf acts after you each turn. Target token amplifies ALL party damage against that enemy.",
          "Beastcaller (Red): Summon a Bear pet (5 HP) and gain Focus buff (+2 to rolls, 2 uses). Bear provides shields to position 1 ally via Swipe. Focus buff is extremely strong for burst windows.",
        ],
      },
      {
        type: "heading",
        text: "Pet Mechanics",
      },
      {
        type: "paragraph",
        text: "Pets roll on their own d6 table and act immediately after the Tracker. Pets persist until killed. If the Tracker dies, the pet fights until end of combat, then disappears. Wolf has 7 HP, Bear has 5 HP, and both can be targeted by monsters.",
      },
      {
        type: "heading",
        text: "Weapon Progression",
      },
      {
        type: "list",
        items: [
          "Common: Hunter's Bow (+1 vs Target enemies) synergizes with Huntmaster, or Sturdy Crossbow (Aimed Shot on 3+) for consistency.",
          "Rare: Longshot (+10g per attack, +30g on crit 6) for economy runs, or Wild Bow (pets +1 damage) for pet-focused builds.",
          "Epic: Thunderstrike (Aimed Shot: even = Stun, odd = +30g) for control/economy hybrid, or Beastmaster's Pride (both pets active) for maximum pet damage.",
          "Legendary: Voidwatcher (attacks hit all enemies for half, Hunter's Mark affects all) for AoE, or Twin Claws (pets inherit enchantments, can crit) for pet-focused endgame.",
        ],
      },
      {
        type: "tip",
        text: "Huntmaster's Target token is party-wide damage amplification. Apply it early in combat so every hero benefits. With Hunter's Bow, the Tracker themselves gets +1 against the targeted enemy on every attack.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // GUARDIAN GUIDE
  // ─────────────────────────────────────────────────────────────
  {
    id: "class-guardian",
    category: "Class Guides",
    title: "Guardian",
    icon: "🛡️",
    content: [
      {
        type: "paragraph",
        text: "18 HP tank and party protector. Can redirect attacks to self once per turn. Provides shields, healing, and immunity. The backbone of any defensive composition.",
      },
      {
        type: "heading",
        text: "Roll Table Analysis",
      },
      {
        type: "table",
        headers: ["Roll", "Ability", "Notes"],
        rows: [
          ["1", "Shield Bash (1 dmg + 1 shield)", "Low damage but builds defense"],
          ["2", "Defensive Stance (1 dmg + party shields)", "Party-wide protection — great vs AoE monsters"],
          ["3", "Heavy Strike (3 dmg)", "Reliable damage when you need it"],
          ["4", "Rally (party heal 2 + reroll)", "Best support roll — heal everyone AND attack again"],
          ["5", "Retribution (4 dmg + heal ally 3)", "Damage + targeted healing for emergencies"],
          ["6", "Fortress (5 dmg + immune next turn)", "Ultimate defensive turn — immune to ALL damage"],
        ],
      },
      {
        type: "heading",
        text: "Specializations",
      },
      {
        type: "list",
        items: [
          "Sentinel (Black): +4 max HP (this combat only) and 3 shields (each reducing 3 damage). The tankiest option — 22 HP with 9 total damage reduction from shields during combat. Best for sustained fights and absorbing boss hits.",
          "Warden (Red): All heroes gain 2 shields (each reducing 2 damage) lasting 3 turns. Party-wide protection — 6 total shields across 3 heroes. Best vs multi-hit or AoE monsters.",
        ],
      },
      {
        type: "heading",
        text: "Weapon Progression",
      },
      {
        type: "list",
        items: [
          "Common: Tower Shield (+1 HP per combat) for sustained runs, or Soldier's Sword (Rally heals 3) for stronger support.",
          "Rare: Stargazer Spear (attack any target) for flexibility, or Aegis Wall (shields block +1) for pure defense.",
          "Epic: Fortress Gate (immune to first damage each combat; Fortress makes party immune) for boss fights, or Retributor (1 damage reflect) for passive damage.",
          "Legendary: Fyrizul (attacks heal party 1 HP, Execute threshold ≤7 HP) — incredible team weapon. Eternal Vigil (start with 3 shields, gain shield on any heal) for unbreakable defense.",
        ],
      },
      {
        type: "tip",
        text: "Guardian's attack redirection (once per turn) is your most powerful defensive tool. Use it to protect low-HP heroes from lethal hits. Combine with Fortress (roll 6) for a turn where you redirect AND become immune.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // COMBAT TACTICS
  // ─────────────────────────────────────────────────────────────
  {
    id: "combat-tactics",
    category: "Combat Tactics",
    title: "Mastering Combat",
    icon: "⚔️",
    content: [
      {
        type: "heading",
        text: "APC Matching System",
      },
      {
        type: "paragraph",
        text: "Each combat, heroes draw 1 APC (a Peon card). Monsters draw 2 APCs (3 for elite, 4 for final boss). When you flip Peon cards and the rank matches an APC, you trigger a Match. Matches grant bonus effects and are the core combat engine.",
      },
      {
        type: "table",
        headers: ["Match Type", "Condition", "Bonus"],
        rows: [
          ["Single Match", "One card matches one APC", "Trigger ability effect"],
          ["Double Match", "Both cards match different APCs", "Trigger both + +1 damage"],
          ["Set Match", "Both cards match same APC", "+1 to next roll"],
          ["Chain Match", "3+ consecutive matches", "+2 to next roll"],
        ],
      },
      {
        type: "tip",
        text: "Chain Matches are the most powerful combat mechanic. If your party can chain matches across turns, the +2 roll bonus compounds with weapon effects and buffs for devastating results. Scholar's Staff (+1 temp APC) increases match probability.",
      },
      {
        type: "heading",
        text: "Turn Order Optimization",
      },
      {
        type: "list",
        items: [
          "Monsters always act first — plan around the damage you'll take before acting.",
          "Hero turn order is chosen by the party and locked in for the round. Choose carefully based on current HP and monster state.",
          "Send your Guardian first if the monster is at high HP — they can shield the party before others act.",
          "Send your Bladedancer last if the monster is at low HP — Execute becomes available as a finisher.",
          "Manipulator's Timebender extra turn can be used mid-round for emergency control or healing.",
        ],
      },
      {
        type: "heading",
        text: "Token Economy",
      },
      {
        type: "table",
        headers: ["Token", "Effect", "Max", "Strategy"],
        rows: [
          ["Shield", "Reduces damage", "5", "Stack before boss turns; Guardian's shields reduce 2-3 each"],
          ["Target", "+1 damage taken", "1, 3 turns", "Apply early — amplifies all party damage"],
          ["Buff", "Named positive effect", "3", "Might (+2 dmg), Haste (extra action), Focus (+2 roll), Regen (1 HP/turn)"],
          ["Debuff", "Named negative effect", "3", "Poison (1 dmg/turn), Freeze (must roll 4+), Stun (skip turn), Burn (1 dmg/turn)"],
          ["Counter", "Tracks values", "6", "Used by Edge of Eclipse, combo chains, pet tracking"],
        ],
      },
      {
        type: "heading",
        text: "When to Use Items in Combat",
      },
      {
        type: "list",
        items: [
          "Power Scroll: Use before a high-damage hero's turn (Bladedancer roll 5-6, Tracker roll 5). The +3 damage can secure a kill.",
          "Bomb: Use when multiple enemies are present (summons + monster). 5 AoE damage can clear summons and chunk the boss.",
          "Guardian Angel: Pre-emptive — equip on your squishiest hero (Bladedancer/Tracker) before dangerous combats.",
          "Ability Blocker: Save for boss fights — negating a boss special can prevent a party wipe.",
          "Speed Potion: Use on your highest-damage hero for a double-turn burst window.",
          "Smoke Bomb: Skip dangerous non-essential combats to preserve HP for boss rooms.",
        ],
      },
      {
        type: "warning",
        text: "Items are limited (3 slots per hero + weapon). Don't waste consumables on easy combats — save them for elites, mini-bosses, and the final confrontation. A well-timed Ability Blocker on Vyridian's Phase 3 is worth more than 5 minor potions used carelessly.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // ECONOMY & GOLD MANAGEMENT
  // ─────────────────────────────────────────────────────────────
  {
    id: "economy-gold",
    category: "Economy",
    title: "Gold Management",
    icon: "💰",
    content: [
      {
        type: "paragraph",
        text: "Your party starts with 120g total (40g per hero). Gold is scarce and every purchase matters. Understanding the economy is the difference between a strong run and a struggling one.",
      },
      {
        type: "heading",
        text: "Starting Resources",
      },
      {
        type: "list",
        items: [
          "Each hero: 40g + class-specific starting item + Common weapon",
          "Welcome Bonus (2d6): 2-5 = 20g, 6-8 = Common weapon, 9-10 = Common weapon + 20g, 11-12 = Rare weapon",
          "Welcome Bonus odds: 20g (26%), Common weapon (44%), Common + 20g (17%), Rare weapon (3%)",
          "A Rare weapon from Welcome Bonus saves 100g — extremely valuable early game.",
        ],
      },
      {
        type: "heading",
        text: "Gold Income by Tier",
      },
      {
        type: "table",
        headers: ["Source", "Tier 1", "Tier 2", "Tier 3"],
        rows: [
          ["Combat reward (base)", "~15-25g", "~22-37g", "~34-56g"],
          ["Elite combat bonus", "+50%", "+50%", "+50%"],
          ["Mini-boss bonus", "100g", "150g", "225g"],
          ["Rest room (gold option)", "2d6×10", "2d6×20", "2d6×30"],
          ["Tracker Longshot", "+10g/attack", "+10g/attack", "+10g/attack"],
        ],
      },
      {
        type: "heading",
        text: "Spending Priorities",
      },
      {
        type: "list",
        items: [
          "Tier 1: Prioritize 1-2 Rare weapons for your DPS heroes (100g each). Skip enchantments — save gold for healing.",
          "Tier 1: Buy Minor Potions (30g) only if your composition lacks healing. Guardian + Manipulator can often skip potions.",
          "Tier 2: Upgrade key weapons to Epic (200g + 100g upgrade). Buy 1-2 enchantments (Mighty 75g or Precise 90g).",
          "Tier 2: Consider Party Fund (200g) if you plan to buy multiple items — 10% discount pays off over 5+ purchases.",
          "Tier 3: Legendary weapons (400g + 200g upgrade) for your carry. Divine enchantment (200g) for boss fight.",
          "Tier 3: Stockpile Guardian Angels (225g) and Ability Blockers (135g) for Vyridian.",
        ],
      },
      {
        type: "tip",
        text: "Tracker with Longshot weapon generates +10g per attack and +30g on critical hits (roll 6). Over a 10-room tier, that's 100-300g of passive income — effectively a free Rare weapon.",
      },
      {
        type: "heading",
        text: "Selling Items",
      },
      {
        type: "paragraph",
        text: "Items sell for 25% of their purchase price. Only sell when you need the slot or gold for a critical upgrade. Permanent upgrades and weapons cannot be sold.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // SHOPPING PRIORITIES
  // ─────────────────────────────────────────────────────────────
  {
    id: "shopping-priorities",
    category: "Economy",
    title: "Shopping Guide",
    icon: "🛒",
    content: [
      {
        type: "heading",
        text: "Weapon Upgrade Paths",
      },
      {
        type: "paragraph",
        text: "Weapons are class-specific and upgrade through rarity tiers. Upgrading keeps enchantments. The upgrade cost is 50% of the next tier's base cost.",
      },
      {
        type: "table",
        headers: ["Rarity", "Cost", "Available", "Upgrade Cost"],
        rows: [
          ["Common", "50g", "All tiers", "—"],
          ["Rare", "100g", "All tiers", "+50g"],
          ["Epic", "200g", "Tier 2+", "+100g"],
          ["Legendary", "400g", "Tier 3 only", "+200g"],
        ],
      },
      {
        type: "list",
        items: [
          "Total cost to go Common → Rare: 150g (100g base + 50g upgrade)",
          "Total cost to go Rare → Epic: 350g (200g base + 100g upgrade, Tier 2+)",
          "Total cost to go Epic → Legendary: 700g (400g base + 200g upgrade, Tier 3)",
          "Reforge (50% of current cost) lets you switch weapons within the same tier — useful if your Rare weapon's effect doesn't fit your strategy.",
        ],
      },
      {
        type: "heading",
        text: "Enchantment Recommendations by Class",
      },
      {
        type: "table",
        headers: ["Class", "Best Enchantment", "Why"],
        rows: [
          ["Bladedancer", "Mighty (+1 on 4-6)", "Amplifies high rolls — Execute and Blade Dance benefit enormously"],
          ["Bladedancer", "Precise (+1 to all rolls)", "Consistent — turns 5s into 6s for Blade Dance"],
          ["Manipulator", "Vampiric (heal on 5-6)", "Self-sustain complements support role"],
          ["Manipulator", "Precise (+1 to all rolls)", "More 6s = more Psionic Storm party heals"],
          ["Tracker", "Mighty (+1 on 4-6)", "Power Shot (5) and Aimed Shot (4) hit even harder"],
          ["Tracker", "Explosive (AoE on 6)", "Clears summons alongside main target"],
          ["Guardian", "Defensive (shield on 1-2)", "Turns low rolls into defense — perfect for tank role"],
          ["Guardian", "Divine (heal ally on 6)", "Double healing on Fortress/Rally turns"],
        ],
      },
      {
        type: "heading",
        text: "Item Purchase Priority",
      },
      {
        type: "list",
        items: [
          "Tier 1 Priority: 1) Rare weapon for DPS 2) Minor Potions (if no healer) 3) Shield Charms for Guardian",
          "Tier 2 Priority: 1) Epic weapon upgrade 2) Enchantment 3) Guardian Angel 4) Ability Blocker",
          "Tier 3 Priority: 1) Legendary weapon 2) Divine/Vampiric enchantment 3) Guardian Angel x2 4) Ability Blocker x2 5) Speed Potion",
        ],
      },
      {
        type: "heading",
        text: "Permanent Upgrade Value",
      },
      {
        type: "table",
        headers: ["Upgrade", "Cost (T1)", "Value Rating", "Notes"],
        rows: [
          ["HP Increase", "80g", "★★★★★", "+2 max HP, up to 3 per hero. Best gold-per-HP ratio early."],
          ["Lucky Dice", "150g", "★★★★☆", "+1 to ALL rolls. Game-changing but expensive. Priority for DPS."],
          ["Extra Pocket", "100g", "★★★☆☆", "+1 item slot. Good for item-heavy strategies. 2 per party."],
          ["Party Fund", "200g", "★★★★☆", "10% discount on everything. Pays for itself after ~500g of purchases."],
        ],
      },
      {
        type: "heading",
        text: "Healing Service Efficiency",
      },
      {
        type: "list",
        items: [
          "Patch Up (20g T1): 5 HP to one hero — efficient for topping off after a single combat.",
          "First Aid (40g T1): Full heal one hero — best value when a hero is at very low HP.",
          "Group Heal (60g T1): 5 HP to all — excellent after a tough AoE combat. Saves 3 individual Patch Ups.",
          "Full Restore (80g T1): Full heal all — use before boss rooms. Most gold-efficient when multiple heroes are low.",
          "Revive 50% (60g T1): Only option if a hero died mid-run. Always revive before boss rooms.",
          "Revive Full (100g T1): Worth it if the revived hero has strong weapons/enchantments equipped.",
        ],
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // ENCHANTMENT & ITEM SYNERGIES
  // ─────────────────────────────────────────────────────────────
  {
    id: "synergies",
    category: "Synergies",
    title: "Enchantment & Item Synergies",
    icon: "🔮",
    content: [
      {
        type: "heading",
        text: "Best-in-Slot Enchantments",
      },
      {
        type: "list",
        items: [
          "Bladedancer + Mighty: +1 damage on rolls 4-6 means Execute deals 5, Blade Dance deals 4, Eviscerate deals 4. Combined with combo chains, this is lethal.",
          "Bladedancer + Ethereal: Phase-through attacks ignore shields. Perfect vs shielded bosses — no damage wasted on shield reduction.",
          "Manipulator + Precise: +1 to all rolls means Mind Flay chains more often (even numbers), Psionic Storm triggers more (6+1=7), and Mind Control is more reliable.",
          "Tracker + Explosive: On roll 6, deal half damage to ALL enemies. With Power Shot (5 dmg), that's 5 to main target + 2-3 to everything else. Clears summons instantly.",
          "Guardian + Defensive: Gain 1 shield on rolls 1-2. Turns the worst rolls into defense. Combined with Shield Bash (roll 1), you get 1 damage + 2 shields.",
          "Guardian + Divine: On roll 6, heal lowest HP ally 2 HP. Fortress (roll 6) becomes 5 damage + immunity + 2 HP heal. Incredible value.",
        ],
      },
      {
        type: "heading",
        text: "Item Combos",
      },
      {
        type: "list",
        items: [
          "Power Scroll + Bladedancer Execute: +3 damage on a roll 5 Execute = 7 damage with instakill at ≤5 HP. Nearly guarantees a kill.",
          "Power Scroll + Tracker Power Shot: +3 damage on roll 5 = 8 damage single-hit. Highest burst in the game outside of crits.",
          "Guardian Angel + Bladedancer/Tracker: Your squishiest DPS gets a safety net. Auto-revive at 50% HP means they can play aggressively.",
          "Bomb + Manipulator Mind Control: Bomb for 5 AoE, then Mind Control for 4 self-damage. 9 total damage to the main target plus summon clear.",
          "Ability Blocker + Speed Potion: Block the boss special, then take an extra turn to burst. Two-turn window with no monster special threat.",
          "Lucky Charm + any high-roll ability: Reroll a 1 into a potential 6. Best used on Bladedancer (Execute/Blade Dance) or Tracker (Power Shot).",
        ],
      },
      {
        type: "heading",
        text: "Weapon-Enchantment Pairings",
      },
      {
        type: "table",
        headers: ["Weapon", "Best Enchantment", "Synergy"],
        rows: [
          ["Starforged Blade", "Mighty", "+1 weapon damage + +1 enchant damage = +2 on 4-6 rolls with dual specs"],
          ["Edge of Eclipse", "Precise", "+1 to rolls means more 6s, faster counter buildup for every-3rd-attack double"],
          ["Fyrizul", "Divine", "Attacks heal party 1 + Divine heals 2 on 6 = massive party sustain"],
          ["Eternal Vigil", "Defensive", "Start with 3 shields + gain shields on 1-2 + gain shield on heal = unbreakable"],
          ["Voidwatcher", "Explosive", "AoE attacks + Explosive on 6 = hits everything for massive spread damage"],
          ["Longshot", "Precise", "+1 to rolls = more 6s = more critical hits = more gold generation"],
        ],
      },
      {
        type: "tip",
        text: "Toxic enchantment (from Serpent's Kiss weapon) is slot-free — it doesn't count against your one-enchantment limit. This means you can have Toxic AND another enchantment simultaneously. Stack poison with Toxic for passive damage every turn.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // TIER PROGRESSION
  // ─────────────────────────────────────────────────────────────
  {
    id: "tier-progression",
    category: "Progression",
    title: "Tier-by-Tier Strategy",
    icon: "🏰",
    content: [
      {
        type: "heading",
        text: "Tier 1 — Foundation (10 Rooms)",
      },
      {
        type: "list",
        items: [
          "Goal: Establish your core build. Get 1-2 Rare weapons and build a gold buffer.",
          "Combat rooms are manageable — use them to learn your party's dynamics.",
          "Rest rooms: Choose gold (2d6×10) if you're healthy, or full heal if you took damage.",
          "Merchant: Buy Rare weapon for your primary DPS. Skip enchantments — save gold.",
          "Avoid Elite combats unless your party is healthy and well-equipped. The +5 HP and +1 APC elite bonus is nice but not worth a party wipe.",
          "End of Tier 1: Aim for 100-150g in reserve, all heroes above 50% HP.",
        ],
      },
      {
        type: "heading",
        text: "Tier 2 — Ascent (12 Rooms)",
      },
      {
        type: "list",
        items: [
          "Goal: Epic weapons, first enchantments, and prepare for Tier 3 difficulty spike.",
          "Monster HP scales significantly (Base + 6). Your damage output needs to keep up.",
          "Merchant: Upgrade DPS weapons to Epic. Buy 1-2 enchantments (Mighty/Precise for DPS, Defensive for Guardian).",
          "Consider Party Fund (200g) if you haven't bought it — the 10% discount compounds across Tier 2 and 3 purchases.",
          "Elite combats become more valuable — the loot quality improves. Attempt with full HP and items ready.",
          "Rest rooms: Prioritize +2 max HP over gold if heroes are dying frequently. HP Increase permanent upgrade is also excellent here.",
          "End of Tier 2: Aim for Epic weapons on 2+ heroes, at least 1 enchantment, 100g+ reserve.",
        ],
      },
      {
        type: "heading",
        text: "Tier 3 — Summit (10 Rooms)",
      },
      {
        type: "list",
        items: [
          "Goal: Legendary weapons, Divine enchantments, stockpile boss-fight items.",
          "Monster HP is at its highest (Base + 9). Fights are longer — sustain matters more than burst.",
          "Merchant: Legendary weapon for your carry (400g + 200g upgrade). Divine or Vampiric enchantment for sustain.",
          "Buy Guardian Angels (225g) and Ability Blockers (135g) — you'll need them for Vyridian.",
          "Mini-bosses in Tier 3 drop guaranteed Rare+ weapons and 225g bonus. Worth the risk if prepared.",
          "Rest rooms: Full heal is priority. Save +2 max HP for after the heal if possible.",
          "Pre-summit: All heroes at full HP, 2+ Guardian Angels equipped, 1-2 Ability Blockers in inventory, Legendary weapon on carry.",
        ],
      },
      {
        type: "heading",
        text: "Tier Transitions",
      },
      {
        type: "paragraph",
        text: "At each tier transition: full heal, +2 max HP, merchant prices increase 50%, monster rewards increase 50%, and all temporary effects are cleared. Use transitions as a reset point — don't carry temp buffs into the new tier expecting them to persist.",
      },
      {
        type: "tip",
        text: "The tier transition full heal is a free Full Restore (80g+ value). Time your last combat so you enter the transition at low HP — you waste the heal if you're already at full. This lets you spend less on healing services and more on upgrades.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // BOSS STRATEGIES
  // ─────────────────────────────────────────────────────────────
  {
    id: "boss-strategies",
    category: "Boss Strategy",
    title: "Boss Encounters",
    icon: "👹",
    content: [
      {
        type: "heading",
        text: "Mini-Bosses",
      },
      {
        type: "paragraph",
        text: "Four mini-bosses can appear in the Astrilith: Behemoth, Cyclops, Dragon, and Titan. Each has unique abilities and a guaranteed Rare+ weapon drop plus 100g×tier bonus.",
      },
      {
        type: "table",
        headers: ["Mini-Boss", "Key Threat", "Strategy"],
        rows: [
          ["Behemoth", "High HP, heavy hits", "Outlast with Guardian shields and Manipulator healing. Focus on sustained damage."],
          ["Cyclops", "High damage single hits", "Ability Blocker to negate its special. Burst down with Power Scrolls."],
          ["Dragon", "AoE breath attacks", "Warden spec for party shields. Spread damage across turns to avoid overcommitting."],
          ["Titan", "Multiple APCs, complex specials", "Shadowblade to steal APCs. Illusionist to reduce its rolls. Control-focused approach."],
        ],
      },
      {
        type: "heading",
        text: "The Final Confrontation — Vyridian",
      },
      {
        type: "paragraph",
        text: "35 HP, 4 APCs, no tier scaling. Three phases with escalating threat. Victory requires reducing Vyridian's HP to 0 with at least one Hero surviving the judgment. This is the ultimate test of your build.",
      },
      {
        type: "heading",
        text: "Phase 1: The Measure (35-26 HP)",
      },
      {
        type: "list",
        items: [
          "Uses base monster roll table — the most manageable phase.",
          "Build your defenses: stack shields, apply buffs, set up your pet if Tracker.",
          "Use this phase to trigger specializations — they're once per combat, so use them early.",
          "Aim to exit Phase 1 with full party HP and shields active.",
          "Damage goal: 10 HP removed (to 25 HP) to trigger Phase 2.",
        ],
      },
      {
        type: "heading",
        text: "Phase 2: The Conduction (25-16 HP)",
      },
      {
        type: "list",
        items: [
          "+2 to all rolls — significantly more dangerous. Immune to debuffs (Illusionist won't work here!).",
          "Roll 6 = Black Hole — a devastating special ability. Use Ability Blocker to negate it.",
          "Switch to aggressive damage — you need to push through to Phase 3 before Black Hole triggers.",
          "Guardian should use Fortress (roll 6) for immunity turns during this phase.",
          "Save at least 1 Guardian Angel for Phase 3 — don't use them all here.",
          "Damage goal: 10 HP removed (to 15 HP) to trigger Phase 3.",
        ],
      },
      {
        type: "warning",
        text: "Phase 2 debuff immunity means Illusionist specialization, Poison, Freeze, Stun, and all other debuffs are useless. Switch to raw damage and shield strategies. Buffs still work — Might, Focus, and Haste remain effective.",
      },
      {
        type: "heading",
        text: "Phase 3: The Harmonic Trial (15-0 HP)",
      },
      {
        type: "list",
        items: [
          "Acts TWICE per turn — the most dangerous phase. Every round, Vyridian attacks twice before your heroes.",
          "+1 damage on all attacks. Roll 6 = Reality Break — potentially party-wiping.",
          "Use remaining Ability Blockers immediately — negating Reality Break is critical.",
          "Burn all remaining items: Power Scrolls, Bombs, Speed Potions — this is the final fight.",
          "Guardian Angel auto-revives should trigger here if heroes fall — keep fighting.",
          "Focus fire: all heroes target Vyridian. Don't worry about summons — keep all damage on the Conductor.",
          "Timebender extra turns are invaluable here — Manipulator gets double actions.",
          "If you reach Phase 3 with 2+ heroes alive and items in stock, you can win.",
        ],
      },
      {
        type: "tip",
        text: "The key to Vyridian is Phase 1 efficiency. If you can clear Phase 1 in 2-3 rounds with minimal damage taken, you enter Phase 2 with full resources. A clean Phase 1 is the difference between victory and defeat.",
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  // DIFFICULTY MODES
  // ─────────────────────────────────────────────────────────────
  {
    id: "difficulty-modes",
    category: "Progression",
    title: "Difficulty Modes",
    icon: "🎮",
    content: [
      {
        type: "table",
        headers: ["Mode", "Key Changes", "Strategy Adjustment"],
        rows: [
          ["Easy", "150g start, +2 HP, revival -50%, monsters -2 HP", "Aggressive spending — buy early upgrades. Extra gold means earlier Rare weapons. Extra HP means more risk-taking."],
          ["Normal", "Standard rules", "Balanced approach. Follow the tier-by-tier strategy above."],
          ["Hard", "80g start, no Welcome weapons, monsters +1 to rolls, permanent death", "Conservative economy. Every gold matters. Prioritize survival over upgrades. Guardian is near-mandatory. Avoid elites."],
          ["Nightmare", "40g start, monster tier bonuses, items +50%, lose 25% gold on death, 40-turn limit", "Speed is essential — 40 turns means ~13 rooms per tier. Skip non-essential combats with Smoke Bombs. Prioritize burst damage over sustain. Every death costs 25% of your gold — avoid deaths at all costs."],
        ],
      },
      {
        type: "heading",
        text: "Easy Mode Tips",
      },
      {
        type: "list",
        items: [
          "150g starting budget means you can buy a Rare weapon at the first merchant.",
          "+2 HP per hero makes Glass Cannon compositions viable.",
          "Revival costs are halved — don't fear death as much.",
          "Use Easy mode to learn class mechanics and test compositions.",
        ],
      },
      {
        type: "heading",
        text: "Hard Mode Tips",
      },
      {
        type: "list",
        items: [
          "80g start means you can't afford anything at the first merchant — focus on combat rewards.",
          "No Welcome Bonus weapons — you're stuck with Commons until you earn gold.",
          "Permanent death means if a hero dies and isn't revived, they're gone for the run.",
          "Guardian is essential — you need the tanking and healing. Manipulator for revive support.",
          "Avoid Elite combats — the risk of permanent death isn't worth the reward.",
        ],
      },
      {
        type: "heading",
        text: "Nightmare Mode Tips",
      },
      {
        type: "list",
        items: [
          "40g start is brutally tight — you can barely afford a single Minor Potion.",
          "The 40-turn limit is the real killer. You must reach Vyridian by turn 35 to have 5 turns for the fight.",
          "Smoke Bombs are mandatory — skip combat rooms that aren't on your critical path.",
          "Treasure Maps can offset the gold shortage — double combat rewards when you do fight.",
          "Tracker with Longshot is your economy engine — passive gold generation is crucial.",
          "Losing 25% gold on death means a single death can cost you your weapon upgrade fund.",
          "Bring Ability Blockers for Vyridian — you can't afford to eat Reality Breaks.",
        ],
      },
    ],
  },
];

export const BASIC_TIPS: StrategyBlock[] = [
  {
    type: "heading",
    text: "Quick Start Tips for New Players",
  },
  {
    type: "tip",
    text: "Pick Guardian in your party. A tank that absorbs hits and heals makes the game far more forgiving while you learn.",
  },
  {
    type: "tip",
    text: "Monsters target your lowest-HP hero first. Keep an eye on which hero is most injured — use shields and heals to protect them before the monster's turn.",
  },
  {
    type: "tip",
    text: "Keep your heroes alive — a dead hero deals no damage. Use the Guardian's shields and heals to protect injured heroes, and use potions to top up low HP before the monster's turn.",
  },
  {
    type: "tip",
    text: "Don't forget about items in combat. Bombs deal 5 damage to all enemies, Ability Blockers shut down boss specials, and Potions heal injured heroes before they go down. Check your inventory before tough encounters.",
  },
  {
    type: "tip",
    text: "Save your gold for weapon upgrades at the merchant. A Rare weapon on your DPS hero is the single biggest power spike in the game.",
  },
  {
    type: "tip",
    text: "Buy at least one healing potion before boss fights. If a hero gets critically low on HP, a potion can save them before the monster finishes them off.",
  },
  {
    type: "tip",
    text: "Don't skip Rest rooms. Healing between fights keeps your party healthy and prevents snowballing damage.",
  },
  {
    type: "tip",
    text: "Bring Ability Blockers to boss fights. Boss special abilities are devastating — blocking them can be the difference between winning and wiping.",
  },
  {
    type: "warning",
    text: "Don't hoard gold. Unspent gold at the end of a run is wasted. Spend it on upgrades, potions, and enchantments as you go.",
  },
  {
    type: "warning",
    text: "Don't ignore enchantments. Even a Common enchantment on your weapon adds meaningful damage. Check the merchant's enchantment stock every visit.",
  },
  {
    type: "warning",
    text: "Don't fight every Elite monster you see. Elites hit hard and can kill heroes early on. Skip them with Smoke Bombs until your party is well-equipped.",
  },
  {
    type: "heading",
    text: "Recommended First Run",
  },
  {
    type: "list",
    items: [
      "Play on Easy mode — extra gold and HP make learning much smoother.",
      "Choose Bladedancer + Manipulator + Guardian for a balanced, forgiving party.",
      "Upgrade Bladedancer's weapon to Rare at the first merchant you find.",
      "Buy Minor Potions whenever you can afford them — always have at least one in reserve.",
      "Explore most rooms but skip Elite combats until your weapons are upgraded.",
    ],
  },
];
