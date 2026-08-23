import React from "react";
import type { GameState } from "../types/gameState";
import type { GameEventType } from "../types/events";
import type { HeroState } from "../types/heroes";
import type { MonsterState } from "../types/monsters";
import { CLASS_TEXT_COLORS } from "./nameResolver";
import { ALL_CLASSES } from "../data/classes";
import { getSpecialization } from "../data/classes";
import type { HeroClassName, Specialization } from "../types/heroes";
import type { PartySetupChoice } from "../engine/gameState";
import { getGoldCoinImage } from "../assets/assetRegistry";

const ALL_SPECS: Specialization[] = [
  "Shadowblade", "Runeblade", "Timebender", "Illusionist",
  "Huntmaster", "Beastcaller", "Sentinel", "Warden",
];

const SPEC_CLASS_MAP: Record<Specialization, HeroClassName> = {
  Shadowblade: "Bladedancer",
  Runeblade: "Bladedancer",
  Timebender: "Manipulator",
  Illusionist: "Manipulator",
  Huntmaster: "Tracker",
  Beastcaller: "Tracker",
  Sentinel: "Guardian",
  Warden: "Guardian",
};

interface EventTypeStyle {
  color: string;
  icon: string;
}

export const EVENT_TYPE_STYLES: Record<string, EventTypeStyle> = {
  // Combat events
  DAMAGE_APPLIED: { color: "text-orange-400", icon: "⚔" },
  DAMAGE_CALCULATED: { color: "text-orange-400/60", icon: "⚔" },
  HEAL_APPLIED: { color: "text-green-400", icon: "✚" },
  ABILITY_TRIGGERED: { color: "text-purple-400", icon: "✦" },
  DICE_ROLLED: { color: "text-blue-300", icon: "🎲" },
  TURN_STARTED: { color: "text-spire-muted/70", icon: "▸" },
  CARD_FLIPPED: { color: "text-spire-gold", icon: "🂠" },
  MATCH_DETECTED: { color: "text-blue-300", icon: "✦" },
  HERO_DIED: { color: "text-red-500 font-medium", icon: "💀" },
  HERO_REVIVED: { color: "text-green-400 font-medium", icon: "✨" },
  MONSTER_DEFEATED: { color: "text-yellow-400 font-medium", icon: "🏆" },
  MONSTER_REVEALED: { color: "text-red-300", icon: "👁" },
  COMBAT_STARTED: { color: "text-red-400", icon: "⚔" },
  COMBAT_ENDED: { color: "text-spire-gold", icon: "🏁" },
  TOKEN_ADDED: { color: "text-cyan-400", icon: "🔵" },
  TOKEN_REMOVED: { color: "text-spire-muted", icon: "🔵" },
  STATUS_ADDED: { color: "text-pink-400", icon: "⚠" },
  STATUS_REMOVED: { color: "text-spire-muted", icon: "⚠" },
  ITEM_USED: { color: "text-cyan-300", icon: "🧪" },
  // Room/spire events
  GAME_STARTED: { color: "text-spire-gold font-medium", icon: "🎮" },
  SEED_SET: { color: "text-spire-muted/60", icon: "🌱" },
  PARTY_CREATED: { color: "text-spire-accent", icon: "👥" },
  ROOM_REVEALED: { color: "text-spire-muted", icon: "🚪" },
  SPLIT_CHOICE: { color: "text-blue-400", icon: "🔀" },
  MERCHANT_ENTERED: { color: "text-amber-400", icon: "🏪" },
  ITEM_BOUGHT: { color: "text-amber-300", icon: "🛒" },
  ITEM_SOLD: { color: "text-amber-300/70", icon: "💰" },
  REST_CHOICE: { color: "text-green-400", icon: "🏕️" },
  ENVIRONMENT_REVEALED: { color: "text-cyan-400", icon: "🌍" },
  APC_ASSIGNED: { color: "text-purple-400/70", icon: "🂠" },
  REWARD_GRANTED: { color: "text-amber-300", icon: "🎁" },
  TIER_ADVANCED: { color: "text-spire-gold font-medium", icon: "🔼" },
  FINAL_BOSS_STARTED: { color: "text-red-500 font-bold", icon: "�" },
  VICTORY: { color: "text-spire-gold font-bold", icon: "🏆" },
  DEFEAT: { color: "text-red-500 font-bold", icon: "☠️" },
  AI_DECISION: { color: "text-spire-muted/50", icon: "⚙" },
  RULE_AMBIGUITY: { color: "text-spire-muted/50", icon: "?" },
  MANUAL_OVERRIDE: { color: "text-spire-muted/50", icon: "✋" },
  STATE_VALIDATION_WARNING: { color: "text-spire-muted/50", icon: "⚠" },
};

export function getEventTypeStyle(type: GameEventType): EventTypeStyle {
  return EVENT_TYPE_STYLES[type] ?? { color: "text-spire-muted", icon: "•" };
}

export interface NameEntry {
  name: string;
  color: string;
}

function buildNameMap(
  heroes: HeroState[],
  monster: MonsterState | undefined,
  summons: MonsterState[]
): Map<string, NameEntry> {
  const map = new Map<string, NameEntry>();
  for (const hero of heroes) {
    // Map hero.name ("Spec Class") to display only the class name
    map.set(hero.name, {
      name: hero.className,
      color: CLASS_TEXT_COLORS[hero.className] ?? "text-spire-white",
    });
    // Also map spec name alone to display as class name
    map.set(hero.specialization, {
      name: hero.className,
      color: CLASS_TEXT_COLORS[hero.className] ?? "text-spire-white",
    });
  }
  // Also map class names so they get colored in summaries
  for (const cls of ALL_CLASSES) {
    map.set(cls, {
      name: cls,
      color: CLASS_TEXT_COLORS[cls] ?? "text-spire-white",
    });
  }
  if (monster) {
    map.set(monster.name, { name: monster.name, color: "text-spire-danger" });
  }
  for (const summon of summons) {
    map.set(summon.name, { name: summon.name, color: "text-spire-danger" });
  }
  return map;
}

const GOLD_COIN_URL = getGoldCoinImage() ?? "";

export function buildNameMapFromPartyChoices(
  partyChoices: PartySetupChoice[]
): Map<string, NameEntry> {
  const map = new Map<string, NameEntry>();
  for (const cls of ALL_CLASSES) {
    map.set(cls, {
      name: cls,
      color: CLASS_TEXT_COLORS[cls] ?? "text-spire-white",
    });
  }
  // Map all spec names
  for (const spec of ALL_SPECS) {
    const cls = SPEC_CLASS_MAP[spec];
    map.set(spec, {
      name: spec,
      color: CLASS_TEXT_COLORS[cls] ?? "text-spire-white",
    });
  }
  for (const choice of partyChoices) {
    const spec = getSpecialization(
      choice.className,
      choice.suit as "clubs" | "spades" | "diamonds" | "hearts"
    );
    const heroName = `${spec} ${choice.className}`;
    map.set(heroName, {
      name: heroName,
      color: CLASS_TEXT_COLORS[choice.className] ?? "text-spire-white",
    });
  }
  return map;
}

export function buildNameMapFromComposition(
  composition: { className: HeroClassName; specialization: string }[]
): Map<string, NameEntry> {
  const map = new Map<string, NameEntry>();
  for (const cls of ALL_CLASSES) {
    map.set(cls, {
      name: cls,
      color: CLASS_TEXT_COLORS[cls] ?? "text-spire-white",
    });
  }
  // Map all spec names
  for (const spec of ALL_SPECS) {
    const cls = SPEC_CLASS_MAP[spec];
    map.set(spec, {
      name: spec,
      color: CLASS_TEXT_COLORS[cls] ?? "text-spire-white",
    });
  }
  for (const member of composition) {
    const heroName = `${member.specialization} ${member.className}`;
    map.set(heroName, {
      name: heroName,
      color: CLASS_TEXT_COLORS[member.className] ?? "text-spire-white",
    });
  }
  return map;
}

function colorNamesAndGold(
  summary: string,
  nameMap: Map<string, NameEntry>
): React.ReactNode {
  const names = Array.from(nameMap.keys()).sort((a, b) => b.length - a.length);

  const parts: React.ReactNode[] = [];
  let remaining = summary;
  let keyCounter = 0;

  while (remaining.length > 0) {
    let earliestIdx = -1;
    let earliestName: string | null = null;
    let earliestType: "name" | "gold" | "dmg" | "apc" | "heroes" | "monster" | "black" | "red" = "name";

    // Search for gold pattern \d+g\b
    const goldSearch = remaining.match(/\b(\d+)g\b/);
    if (goldSearch && goldSearch.index !== undefined) {
      const idx = goldSearch.index;
      if (earliestIdx === -1 || idx < earliestIdx) {
        earliestIdx = idx;
        earliestType = "gold";
        earliestName = null;
      }
    }

    // Search for damage pattern \d+ damage
    const dmgSearch = remaining.match(/\b(\d+) damage/);
    if (dmgSearch && dmgSearch.index !== undefined) {
      const idx = dmgSearch.index;
      if (earliestIdx === -1 || idx < earliestIdx) {
        earliestIdx = idx;
        earliestType = "dmg";
        earliestName = null;
      }
    }

    // Search for "Action:" pattern — insert line break before it
    const actionIdx = remaining.indexOf("Action:");
    if (actionIdx !== -1 && (earliestIdx === -1 || actionIdx < earliestIdx)) {
      earliestIdx = actionIdx;
      earliestType = "action" as any;
      earliestName = null;
    }

    // Search for heal pattern +\d+ HP or \d+ HP
    const healSearch = remaining.match(/\+?(\d+) HP/);
    if (healSearch && healSearch.index !== undefined) {
      const idx = healSearch.index;
      if (earliestIdx === -1 || idx < earliestIdx) {
        earliestIdx = idx;
        earliestType = "heal" as any;
        earliestName = null;
      }
    }

    // Search for HP: N/N pattern
    const hpSearch = remaining.match(/HP: (\d+)\/(\d+)/);
    if (hpSearch && hpSearch.index !== undefined) {
      const idx = hpSearch.index;
      if (earliestIdx === -1 || idx < earliestIdx) {
        earliestIdx = idx;
        earliestType = "hp" as any;
        earliestName = null;
      }
    }

    // Search for ability name pattern: ": Word — " (bold the word between : and —)
    const abilitySearch = remaining.match(/: ([^.—]+) — /);
    if (abilitySearch && abilitySearch.index !== undefined) {
      const idx = abilitySearch.index;
      if (earliestIdx === -1 || idx < earliestIdx) {
        earliestIdx = idx;
        earliestType = "ability" as any;
        earliestName = null;
      }
    }

    // Search for APC
    const apcIdx = remaining.indexOf("APC");
    if (apcIdx !== -1 && (earliestIdx === -1 || apcIdx < earliestIdx)) {
      earliestIdx = apcIdx;
      earliestType = "apc";
      earliestName = null;
    }

    // Search for "Heroes" (bold, cyan-tinted)
    const heroesIdx = remaining.indexOf("Heroes");
    if (heroesIdx !== -1 && (earliestIdx === -1 || heroesIdx < earliestIdx)) {
      earliestIdx = heroesIdx;
      earliestType = "heroes";
      earliestName = null;
    }

    // Search for "Monster" (bold, red)
    const monsterIdx = remaining.indexOf("Monster");
    if (monsterIdx !== -1 && (earliestIdx === -1 || monsterIdx < earliestIdx)) {
      earliestIdx = monsterIdx;
      earliestType = "monster";
      earliestName = null;
    }

    // Search for "Black" (bold, dark/spade-colored)
    const blackIdx = remaining.indexOf("Black");
    if (blackIdx !== -1 && (earliestIdx === -1 || blackIdx < earliestIdx)) {
      earliestIdx = blackIdx;
      earliestType = "black";
      earliestName = null;
    }

    // Search for "Red" (bold, red-colored)
    const redIdx = remaining.indexOf("Red");
    if (redIdx !== -1 && (earliestIdx === -1 || redIdx < earliestIdx)) {
      earliestIdx = redIdx;
      earliestType = "red";
      earliestName = null;
    }

    for (const name of names) {
      const idx = remaining.indexOf(name);
      if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
        earliestIdx = idx;
        earliestName = name;
        earliestType = "name";
      }
    }

    if (earliestIdx === -1) {
      parts.push(remaining);
      break;
    }

    if (earliestType === "apc") {
      if (earliestIdx > 0) {
        parts.push(remaining.slice(0, earliestIdx));
      }
      parts.push(
        <span key={`apc-${keyCounter++}`} style={{ color: "#22d3ee" }}>APC</span>
      );
      remaining = remaining.slice(earliestIdx + 3);
      continue;
    }

    if (earliestType === "heroes") {
      if (earliestIdx > 0) {
        parts.push(remaining.slice(0, earliestIdx));
      }
      parts.push(
        <span key={`heroes-${keyCounter++}`} className="font-bold text-cyan-300">Heroes</span>
      );
      remaining = remaining.slice(earliestIdx + 6);
      continue;
    }

    if (earliestType === "monster") {
      if (earliestIdx > 0) {
        parts.push(remaining.slice(0, earliestIdx));
      }
      parts.push(
        <span key={`monster-${keyCounter++}`} className="font-bold text-red-400">Monster</span>
      );
      remaining = remaining.slice(earliestIdx + 7);
      continue;
    }

    if (earliestType === "black") {
      if (earliestIdx > 0) {
        parts.push(remaining.slice(0, earliestIdx));
      }
      parts.push(
        <span key={`black-${keyCounter++}`} className="font-bold text-spire-white">Black</span>
      );
      remaining = remaining.slice(earliestIdx + 5);
      continue;
    }

    if (earliestType === "red") {
      if (earliestIdx > 0) {
        parts.push(remaining.slice(0, earliestIdx));
      }
      parts.push(
        <span key={`red-${keyCounter++}`} className="font-bold text-red-400">Red</span>
      );
      remaining = remaining.slice(earliestIdx + 3);
      continue;
    }

    if (earliestType === "gold") {
      const match = goldSearch!;
      if (earliestIdx > 0) {
        parts.push(remaining.slice(0, earliestIdx));
      }
      const num = match[1];
      parts.push(
        <span key={`gold-${keyCounter++}`} className="inline-flex items-center gap-0.5 text-spire-gold font-medium">
          {num}
          {GOLD_COIN_URL && <img src={GOLD_COIN_URL} alt="g" className="inline-block w-3 h-3 align-text-bottom" />}
        </span>
      );
      remaining = remaining.slice(earliestIdx + match[0].length);
      continue;
    }

    if (earliestType === "dmg") {
      const match = dmgSearch!;
      if (earliestIdx > 0) {
        parts.push(remaining.slice(0, earliestIdx));
      }
      const num = match[1];
      parts.push(
        <span key={`dmg-${keyCounter++}`} className="text-orange-400 font-medium">
          {num} dmg
        </span>
      );
      remaining = remaining.slice(earliestIdx + match[0].length);
      continue;
    }

    if (earliestType === ("heal" as any)) {
      const match = healSearch!;
      if (earliestIdx > 0) {
        parts.push(remaining.slice(0, earliestIdx));
      }
      parts.push(
        <span key={`heal-${keyCounter++}`} className="text-green-400 font-medium">
          {match[0]}
        </span>
      );
      remaining = remaining.slice(earliestIdx + match[0].length);
      continue;
    }

    if (earliestType === ("hp" as any)) {
      const match = hpSearch!;
      if (earliestIdx > 0) {
        parts.push(remaining.slice(0, earliestIdx));
      }
      parts.push(
        <span key={`hp-${keyCounter++}`} className="text-spire-muted tabular-nums">
          {match[0]}
        </span>
      );
      remaining = remaining.slice(earliestIdx + match[0].length);
      continue;
    }

    if (earliestType === ("ability" as any)) {
      const match = abilitySearch!;
      if (earliestIdx > 0) {
        parts.push(remaining.slice(0, earliestIdx));
      }
      // Push ": " then bold ability name then " — "
      parts.push(remaining.slice(earliestIdx, earliestIdx + 2));
      parts.push(
        <span key={`ability-${keyCounter++}`} className="font-bold text-spire-white">
          {match[1].trim()}
        </span>
      );
      remaining = remaining.slice(earliestIdx + match[0].length);
      continue;
    }

    if (earliestType === ("action" as any)) {
      if (earliestIdx > 0) {
        parts.push(remaining.slice(0, earliestIdx));
      }
      parts.push(<br key={`br-${keyCounter++}`} />);
      remaining = remaining.slice(earliestIdx + 7);
      parts.push(<span key={`action-${keyCounter++}`} className="font-bold text-spire-white">Action:</span>);
      continue;
    }

    if (earliestIdx > 0) {
      parts.push(remaining.slice(0, earliestIdx));
    }

    if (earliestType === "name" && earliestName) {
      const entry = nameMap.get(earliestName);
      if (entry) {
        parts.push(
          <span key={`name-${keyCounter++}`} className={entry.color + " font-bold"} style={{ textShadow: "0 0 8px currentColor" }}>
            {earliestName}
          </span>
        );
        remaining = remaining.slice(earliestIdx + earliestName.length);
        continue;
      }
    }

    parts.push(remaining);
    break;
  }

  return <>{parts}</>;
}

export function formatLogSummary(
  summary: string,
  state: GameState,
  eventType?: GameEventType
): React.ReactNode {
  const heroes = state.party.heroes;
  const monster = state.combat?.monster;
  const summons = state.combat?.summons ?? [];

  // Replace hero full names ("Spec Class") with just class names before formatting
  let processed = summary;
  for (const hero of heroes) {
    if (hero.name !== hero.className) {
      processed = processed.split(hero.name).join(hero.className);
    }
    if (String(hero.specialization) !== String(hero.className)) {
      processed = processed.split(hero.specialization).join(hero.className);
    }
  }

  const nameMap = buildNameMap(heroes, monster, summons);

  if (nameMap.size === 0) return processed;

  return colorNamesAndGold(processed, nameMap);
}

export function formatLogSummaryWithNames(
  summary: string,
  nameMap: Map<string, NameEntry>
): React.ReactNode {
  return colorNamesAndGold(summary, nameMap);
}
