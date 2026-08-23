import type { GameState, MerchantState } from "../types/gameState";
import type { HeroState } from "../types/heroes";
import type { WeaponRarity, EnchantmentName, EnchantmentInstance } from "../types/inventory";
import { ITEMS, HEALING_SERVICES, PERMANENT_UPGRADES, WEAPON_SERVICES, getItemCost, getHealingCost, getUpgradeCost } from "../data/items";
import { WEAPONS, WEAPON_RARITY_DATA } from "../data/weapons";
import { ENCHANTMENTS, getEnchantmentCost } from "../data/enchantments";
import { emitEvent } from "./eventLog";
import { getLivingHeroes, getDeadHeroes } from "./rulesEngine";
import { generateId } from "../utils/ids";
import { itemHasTag } from "../utils/tagMatchers";

export function createMerchant(tier: 1 | 2 | 3): MerchantState {
  const weapons: MerchantState["weapons"] = [];
  for (const w of WEAPONS) {
    if (tier === 1 && w.rarity === "Common") {
      weapons.push({ name: w.name, rarity: w.rarity, cost: w.baseCost, className: w.className });
    } else if (tier === 1 && w.rarity === "Rare") {
      weapons.push({ name: w.name, rarity: w.rarity, cost: w.baseCost, className: w.className });
    } else if (tier === 2 && (w.rarity === "Common" || w.rarity === "Rare" || w.rarity === "Epic")) {
      weapons.push({ name: w.name, rarity: w.rarity, cost: w.baseCost, className: w.className });
    } else if (tier === 3) {
      weapons.push({ name: w.name, rarity: w.rarity, cost: w.baseCost, className: w.className });
    }
  }

  const items: MerchantState["items"] = [];
  for (const [name, data] of Object.entries(ITEMS)) {
    if (data.isJoker) continue;
    const cost = tier === 1 ? data.costs.t1 : tier === 2 ? data.costs.t2 : data.costs.t3;
    items.push({ name, cost, quantity: 3 });
  }

  const enchantments: MerchantState["enchantments"] = [];
  for (const [name, data] of Object.entries(ENCHANTMENTS)) {
    if (data.slotFree && name === "Toxic") continue;
    const cost = tier === 1 ? data.costs.t1 : tier === 2 ? data.costs.t2 : data.costs.t3;
    enchantments.push({ name, cost });
  }

  const healingServices: MerchantState["healingServices"] = [];
  for (const [name, data] of Object.entries(HEALING_SERVICES)) {
    const cost = tier === 1 ? data.costs.t1 : tier === 2 ? data.costs.t2 : data.costs.t3;
    healingServices.push({ name, cost, effect: data.effect });
  }

  const permanentUpgrades: MerchantState["permanentUpgrades"] = [];
  for (const [name, data] of Object.entries(PERMANENT_UPGRADES)) {
    const cost = tier === 1 ? data.costs.t1 : tier === 2 ? data.costs.t2 : data.costs.t3;
    permanentUpgrades.push({ name, cost, effect: data.effect });
  }

  const weaponServices: MerchantState["weaponServices"] = [];
  for (const [name, data] of Object.entries(WEAPON_SERVICES)) {
    weaponServices.push({ name, cost: data.cost, effect: data.effect });
  }

  return {
    tier,
    weapons,
    items,
    enchantments,
    healingServices,
    permanentUpgrades,
    weaponServices,
    visited: false,
  };
}

export function enterMerchant(state: GameState): GameState {
  const merchant = createMerchant(state.spire.tier);
  const newState: GameState = {
    ...state,
    phase: "merchant",
    merchant,
  };

  return emitEvent(newState, "MERCHANT_ENTERED", `Merchant room entered. Tier ${state.spire.tier} prices. Party gold: ${state.party.gold}g.`, {
    details: { tier: state.spire.tier, gold: state.party.gold },
  });
}

export function buyItem(state: GameState, itemName: string, heroId: string): GameState {
  const tier = state.spire.tier;
  const itemData = ITEMS[itemName as keyof typeof ITEMS];
  if (!itemData) return state;

  let cost = tier === 1 ? itemData.costs.t1 : tier === 2 ? itemData.costs.t2 : itemData.costs.t3;
  // Apply merchant price multiplier from tier transitions
  cost = Math.floor(cost * (state.spire.merchantPriceMultiplier ?? 1));
  // Nightmare difficulty: items cost +50%
  if (state.settings.difficulty === "nightmare") cost = Math.floor(cost * 1.5);
  // Party Fund discount: 10% off
  const hasPartyFund = state.party.heroes.some(h => h.upgrades.some(u => u.name === "Party Fund"));
  if (hasPartyFund) cost = Math.floor(cost * 0.9);
  if (state.party.gold < cost) return state;

  const hero = state.party.heroes.find(h => h.id === heroId);
  if (!hero) return state;

  // Extra Pocket: +1 item capacity per upgrade (max 2)
  const extraPockets = hero.upgrades.filter(u => u.name === "Extra Pocket").length;
  const maxSlots = 3 + extraPockets;
  const itemSlots = hero.items.length;
  if (itemSlots >= maxSlots) return state;

  let newState: GameState = {
    ...state,
    party: {
      ...state.party,
      gold: state.party.gold - cost,
      heroes: state.party.heroes.map(h => {
        if (h.id !== heroId) return h;
        return {
          ...h,
          items: [...h.items, {
            id: generateId("item"),
            name: itemName,
            itemId: itemData.itemId,
            effect: itemData.effect,
            stackLimit: itemData.stackLimit,
            quantity: 1,
            isJoker: itemData.isJoker,
            tags: itemData.tags,
          }],
        };
      }),
    },
    stats: { ...state.stats, goldSpent: state.stats.goldSpent + cost },
  };

  newState = emitEvent(newState, "ITEM_BOUGHT", `${hero.name} bought ${itemName} for ${cost}g.`, {
    actorId: heroId,
    details: { itemName, cost, heroName: hero.name },
  });

  return newState;
}

export function buyHealing(state: GameState, serviceName: string, targetHeroId?: string): GameState {
  const tier = state.spire.tier;
  const service = HEALING_SERVICES[serviceName];
  if (!service) return state;

  let cost = getHealingCost(serviceName, tier);
  // Apply merchant price multiplier from tier transitions
  cost = Math.floor(cost * (state.spire.merchantPriceMultiplier ?? 1));
  // Easy difficulty: revival cost -50%
  if (state.settings.difficulty === "easy" && serviceName.includes("Revive")) cost = Math.floor(cost * 0.5);
  // Party Fund discount: 10% off
  const hasPartyFund = state.party.heroes.some(h => h.upgrades.some(u => u.name === "Party Fund"));
  if (hasPartyFund) cost = Math.floor(cost * 0.9);
  if (state.party.gold < cost) return state;

  let newState: GameState = {
    ...state,
    party: {
      ...state.party,
      gold: state.party.gold - cost,
    },
    stats: { ...state.stats, goldSpent: state.stats.goldSpent + cost },
  };

  const living = getLivingHeroes(newState);

  if (serviceName === "Patch Up" && targetHeroId) {
    const hero = newState.party.heroes.find(h => h.id === targetHeroId);
    if (hero) {
      newState = healHero(newState, targetHeroId, 5);
    }
  } else if (serviceName === "First Aid" && targetHeroId) {
    const hero = newState.party.heroes.find(h => h.id === targetHeroId);
    if (hero) {
      newState = healHero(newState, targetHeroId, hero.maxHp - hero.currentHp);
    }
  } else if (serviceName === "Group Heal") {
    for (const hero of living) {
      newState = healHero(newState, hero.id, 5);
    }
  } else if (serviceName === "Full Restore") {
    for (const hero of living) {
      newState = healHero(newState, hero.id, hero.maxHp - hero.currentHp);
    }
  } else if (serviceName === "Revive 50%") {
    // Hard mode: death is permanent
    if (state.settings.difficulty === "hard") {
      return emitEvent(state, "REST_CHOICE", "Death is permanent in Hard mode. Revival unavailable.", {});
    }
    const dead = getDeadHeroes(newState);
    if (dead.length > 0) {
      const target = targetHeroId ? dead.find(h => h.id === targetHeroId) : dead[0];
      if (target) {
        newState = reviveHero(newState, target.id, 50);
      }
    }
  } else if (serviceName === "Revive Full") {
    // Hard mode: death is permanent
    if (state.settings.difficulty === "hard") {
      return emitEvent(state, "REST_CHOICE", "Death is permanent in Hard mode. Revival unavailable.", {});
    }
    const dead = getDeadHeroes(newState);
    if (dead.length > 0) {
      const target = targetHeroId ? dead.find(h => h.id === targetHeroId) : dead[0];
      if (target) {
        newState = reviveHero(newState, target.id, 100);
      }
    }
  }

  return newState;
}

function healHero(state: GameState, heroId: string, amount: number): GameState {
  return {
    ...state,
    party: {
      ...state.party,
      heroes: state.party.heroes.map(h => {
        if (h.id !== heroId || !h.alive) return h;
        return { ...h, currentHp: Math.min(h.maxHp, h.currentHp + amount) };
      }),
    },
  };
}

function reviveHero(state: GameState, heroId: string, percent: number): GameState {
  return {
    ...state,
    party: {
      ...state.party,
      heroes: state.party.heroes.map(h => {
        if (h.id !== heroId || h.alive) return h;
        const reviveHp = Math.floor(h.maxHp * (percent / 100));
        return { ...h, alive: true, currentHp: reviveHp };
      }),
      deadHeroIds: state.party.heroes.filter(h => h.id !== heroId && !h.alive).map(h => h.id),
    },
    stats: { ...state.stats, revivals: state.stats.revivals + 1 },
  };
}

export function buyUpgrade(state: GameState, upgradeName: string, heroId: string): GameState {
  const tier = state.spire.tier;
  const upgrade = PERMANENT_UPGRADES[upgradeName];
  if (!upgrade) return state;

  let cost = getUpgradeCost(upgradeName, tier);
  // Apply merchant price multiplier from tier transitions
  cost = Math.floor(cost * (state.spire.merchantPriceMultiplier ?? 1));
  // Party Fund discount: 10% off
  const hasPartyFund = state.party.heroes.some(h => h.upgrades.some(u => u.name === "Party Fund"));
  if (hasPartyFund) cost = Math.floor(cost * 0.9);
  if (state.party.gold < cost) return state;

  const hero = state.party.heroes.find(h => h.id === heroId);
  if (!hero) return state;

  // Enforce upgrade limits using structured metadata
  if (upgrade.limitType && upgrade.limitCount !== undefined) {
    if (upgrade.limitType === "perHero") {
      const currentCount = hero.upgrades.filter(u => u.name === upgradeName).length;
      if (currentCount >= upgrade.limitCount) return state;
    } else if (upgrade.limitType === "perParty" || upgrade.limitType === "perGame") {
      const currentCount = state.party.heroes.reduce(
        (sum, h) => sum + h.upgrades.filter(u => u.name === upgradeName).length, 0
      );
      if (currentCount >= upgrade.limitCount) return state;
    }
  }

  let newState: GameState = {
    ...state,
    party: {
      ...state.party,
      gold: state.party.gold - cost,
      heroes: state.party.heroes.map(h => {
        if (h.id !== heroId) return h;
        let updated = { ...h };
        if (upgradeName === "HP Increase") {
          updated.maxHp += 2;
          updated.currentHp += 2;
          updated.baseMaxHp += 2;
        } else if (upgradeName === "Lucky Dice") {
          updated.perTurnFlags["luckyDice"] = true;
        }
        updated.upgrades = [...updated.upgrades, {
          id: generateId("upgrade"),
          name: upgradeName as any,
          effect: upgrade.effect,
          count: 1,
        }];
        return updated;
      }),
    },
    stats: { ...state.stats, goldSpent: state.stats.goldSpent + cost },
  };

  newState = emitEvent(newState, "ITEM_BOUGHT", `${hero.name} purchased ${upgradeName} for ${cost}g.`, {
    actorId: heroId,
    details: { upgradeName, cost, heroName: hero.name },
  });

  return newState;
}

const RARITY_ORDER: WeaponRarity[] = ["Common", "Rare", "Epic", "Legendary"];

export function buyWeapon(state: GameState, weaponName: string, heroId: string): GameState {
  const weaponData = WEAPONS.find(w => w.name === weaponName);
  if (!weaponData) return state;

  const hero = state.party.heroes.find(h => h.id === heroId);
  if (!hero) return state;
  if (hero.className !== weaponData.className) return state;

  let cost = weaponData.baseCost;
  cost = Math.floor(cost * (state.spire.merchantPriceMultiplier ?? 1));
  const hasPartyFund = state.party.heroes.some(h => h.upgrades.some(u => u.name === "Party Fund"));
  if (hasPartyFund) cost = Math.floor(cost * 0.9);
  if (state.party.gold < cost) return state;

  const newState: GameState = {
    ...state,
    party: {
      ...state.party,
      gold: state.party.gold - cost,
      heroes: state.party.heroes.map(h => {
        if (h.id !== heroId) return h;
        return {
          ...h,
          weapon: {
            id: generateId("weapon"),
            weaponId: weaponData.id,
            name: weaponData.name,
            rarity: weaponData.rarity,
            className: weaponData.className,
            effect: weaponData.effect,
            description: weaponData.description,
            tags: weaponData.tags,
          },
        };
      }),
    },
    stats: { ...state.stats, goldSpent: state.stats.goldSpent + cost },
  };

  return emitEvent(newState, "ITEM_BOUGHT", `${hero.className} bought ${weaponName} for ${cost}g.`, {
    actorId: heroId,
    details: { weaponName, cost, heroName: hero.className },
  });
}

export function upgradeWeapon(state: GameState, heroId: string): GameState {
  const hero = state.party.heroes.find(h => h.id === heroId);
  if (!hero) return state;

  const currentRarity = hero.weapon.rarity;
  const currentIdx = RARITY_ORDER.indexOf(currentRarity);
  if (currentIdx === -1 || currentIdx >= RARITY_ORDER.length - 1) return state;

  const nextRarity = RARITY_ORDER[currentIdx + 1];
  const nextRarityData = WEAPON_RARITY_DATA[nextRarity];
  const upgradeCost = nextRarityData.upgradeCost;
  if (upgradeCost <= 0) return state;

  // Tier availability check
  const tier = state.spire.tier;
  if (nextRarity === "Epic" && tier < 2) return state;
  if (nextRarity === "Legendary" && tier < 3) return state;

  let cost = upgradeCost;
  cost = Math.floor(cost * (state.spire.merchantPriceMultiplier ?? 1));
  const hasPartyFund = state.party.heroes.some(h => h.upgrades.some(u => u.name === "Party Fund"));
  if (hasPartyFund) cost = Math.floor(cost * 0.9);
  if (state.party.gold < cost) return state;

  // Find a weapon of the next rarity for this class
  const upgradeWeapons = WEAPONS.filter(w => w.className === hero.className && w.rarity === nextRarity);
  if (upgradeWeapons.length === 0) return state;

  // Pick the weapon that matches the current weapon's suit if possible, otherwise first available
  const currentWeaponData = WEAPONS.find(w => w.id === hero.weapon.weaponId);
  const matchingSuit = upgradeWeapons.find(w => w.suit && currentWeaponData?.suit && w.suit === currentWeaponData.suit);
  const chosen = matchingSuit ?? upgradeWeapons[0];

  const newState: GameState = {
    ...state,
    party: {
      ...state.party,
      gold: state.party.gold - cost,
      heroes: state.party.heroes.map(h => {
        if (h.id !== heroId) return h;
        return {
          ...h,
          weapon: {
            ...h.weapon,
            id: generateId("weapon"),
            weaponId: chosen.id,
            name: chosen.name,
            rarity: chosen.rarity,
            effect: chosen.effect,
            description: chosen.description,
            tags: chosen.tags,
          },
        };
      }),
    },
    stats: { ...state.stats, goldSpent: state.stats.goldSpent + cost },
  };

  return emitEvent(newState, "ITEM_BOUGHT", `${hero.className} upgraded weapon to ${chosen.name} (${nextRarity}) for ${cost}g.`, {
    actorId: heroId,
    details: { weaponName: chosen.name, rarity: nextRarity, cost, heroName: hero.className },
  });
}

export function reforgeWeapon(state: GameState, heroId: string): GameState {
  const hero = state.party.heroes.find(h => h.id === heroId);
  if (!hero) return state;

  const currentWeaponData = WEAPONS.find(w => w.id === hero.weapon.weaponId);
  if (!currentWeaponData) return state;

  const sameRarityWeapons = WEAPONS.filter(w =>
    w.className === hero.className &&
    w.rarity === hero.weapon.rarity &&
    w.id !== hero.weapon.weaponId
  );
  if (sameRarityWeapons.length === 0) return state;

  let cost = Math.floor(currentWeaponData.baseCost * 0.5);
  cost = Math.floor(cost * (state.spire.merchantPriceMultiplier ?? 1));
  const hasPartyFund = state.party.heroes.some(h => h.upgrades.some(u => u.name === "Party Fund"));
  if (hasPartyFund) cost = Math.floor(cost * 0.9);
  if (state.party.gold < cost) return state;

  const currentSuit = currentWeaponData.suit;
  const matchingSuit = sameRarityWeapons.find(w => w.suit && w.suit !== currentSuit);
  const chosen = matchingSuit ?? sameRarityWeapons[0];

  const newState: GameState = {
    ...state,
    party: {
      ...state.party,
      gold: state.party.gold - cost,
      heroes: state.party.heroes.map(h => {
        if (h.id !== heroId) return h;
        return {
          ...h,
          weapon: {
            ...h.weapon,
            id: generateId("weapon"),
            weaponId: chosen.id,
            name: chosen.name,
            rarity: chosen.rarity,
            effect: chosen.effect,
            description: chosen.description,
            tags: chosen.tags,
          },
        };
      }),
    },
    stats: { ...state.stats, goldSpent: state.stats.goldSpent + cost },
  };

  return emitEvent(newState, "ITEM_BOUGHT", `${hero.className} reforged to ${chosen.name} (${chosen.rarity}) for ${cost}g.`, {
    actorId: heroId,
    details: { weaponName: chosen.name, oldWeapon: hero.weapon.name, rarity: chosen.rarity, cost, heroName: hero.className },
  });
}

export function repairWeapon(state: GameState, heroId: string): GameState {
  const hero = state.party.heroes.find(h => h.id === heroId);
  if (!hero) return state;

  const tier = state.spire.tier;
  const repairCosts: Record<number, number> = { 1: 30, 2: 45, 3: 68 };
  let cost = repairCosts[tier] ?? 30;
  cost = Math.floor(cost * (state.spire.merchantPriceMultiplier ?? 1));
  const hasPartyFund = state.party.heroes.some(h => h.upgrades.some(u => u.name === "Party Fund"));
  if (hasPartyFund) cost = Math.floor(cost * 0.9);
  if (state.party.gold < cost) return state;

  const hadDebuffs = hero.debuffs.length > 0;
  const hadWeaponDisabled = hero.perTurnFlags["weaponDisabled"] === true;
  if (!hadDebuffs && !hadWeaponDisabled) return state;

  const newState: GameState = {
    ...state,
    party: {
      ...state.party,
      gold: state.party.gold - cost,
      heroes: state.party.heroes.map(h => {
        if (h.id !== heroId) return h;
        return {
          ...h,
          debuffs: [],
          perTurnFlags: { ...h.perTurnFlags, weaponDisabled: false },
        };
      }),
    },
    stats: { ...state.stats, goldSpent: state.stats.goldSpent + cost },
  };

  return emitEvent(newState, "ITEM_BOUGHT", `${hero.className} repaired weapon — removed negative effects for ${cost}g.`, {
    actorId: heroId,
    details: { cost, heroName: hero.className, removedDebuffs: hadDebuffs, removedWeaponDisabled: hadWeaponDisabled },
  });
}

export type SuggestionType = "item" | "healing" | "upgrade" | "weapon" | "weaponUpgrade";

export interface SuggestedPurchase {
  type: SuggestionType;
  name: string;
  cost: number;
  score: number;
  reason: string;
  targetHeroId?: string;
  categoryIcon: string;
  categoryColor: string;
  categoryLabel: string;
}

export function getSuggestedPurchases(state: GameState): SuggestedPurchase[] {
  if (!state.merchant) return [];
  const merchant = state.merchant;
  const gold = state.party.gold;
  const living = getLivingHeroes(state);
  const dead = getDeadHeroes(state);
  const tier = state.spire.tier;
  if (living.length === 0) return [];

  const suggestions: SuggestedPurchase[] = [];
  const injuredHeroes = living.filter(h => h.currentHp < h.maxHp);
  const heavilyInjured = injuredHeroes.filter(h => h.currentHp / h.maxHp < 0.5);
  const allFullHp = living.every(h => h.currentHp >= h.maxHp);

  // --- Healing Services ---
  for (const svc of merchant.healingServices) {
    if (gold < svc.cost) continue;

    if (svc.name === "Patch Up" || svc.name === "First Aid") {
      if (allFullHp) continue;
      const bestTarget = heavilyInjured[0] || injuredHeroes[0];
      if (!bestTarget) continue;
      const missingHp = bestTarget.maxHp - bestTarget.currentHp;
      if (svc.name === "Patch Up" && missingHp <= 5) {
        suggestions.push({
          type: "healing", name: svc.name, cost: svc.cost, score: 78,
          reason: `${bestTarget.name} is missing ${missingHp} HP`,
          targetHeroId: bestTarget.id, categoryIcon: "✚", categoryColor: "text-green-300", categoryLabel: "Healing",
        });
      } else if (svc.name === "First Aid" && missingHp > 5) {
        suggestions.push({
          type: "healing", name: svc.name, cost: svc.cost, score: 82,
          reason: `${bestTarget.name} is missing ${missingHp} HP — full heal is efficient`,
          targetHeroId: bestTarget.id, categoryIcon: "✚", categoryColor: "text-green-300", categoryLabel: "Healing",
        });
      }
    } else if (svc.name === "Group Heal") {
      if (injuredHeroes.length >= 2) {
        suggestions.push({
          type: "healing", name: svc.name, cost: svc.cost, score: 85,
          reason: `${injuredHeroes.length} heroes need healing — group efficiency`,
          targetHeroId: living[0]?.id, categoryIcon: "✚", categoryColor: "text-green-300", categoryLabel: "Healing",
        });
      }
    } else if (svc.name === "Full Restore") {
      if (injuredHeroes.length >= 2 && heavilyInjured.length >= 1) {
        suggestions.push({
          type: "healing", name: svc.name, cost: svc.cost, score: 90,
          reason: `${injuredHeroes.length} heroes injured, some heavily`,
          targetHeroId: living[0]?.id, categoryIcon: "✚", categoryColor: "text-green-300", categoryLabel: "Healing",
        });
      }
    } else if (svc.name === "Revive 50%" || svc.name === "Revive Full") {
      if (dead.length > 0 && state.settings.difficulty !== "hard") {
        const score = svc.name === "Revive Full" ? 95 : 88;
        suggestions.push({
          type: "healing", name: svc.name, cost: svc.cost, score,
          reason: `${dead.length} hero${dead.length > 1 ? "es" : ""} dead — revival is critical`,
          targetHeroId: dead[0]?.id, categoryIcon: "✚", categoryColor: "text-green-300", categoryLabel: "Healing",
        });
      }
    }
  }

  // --- Weapon Upgrades (merged into a single suggestion) ---
  {
    const eligible: { hero: typeof living[number]; nextRarity: typeof RARITY_ORDER[number]; upgradeCost: number }[] = [];
    for (const hero of living) {
      const currentRarityIdx = RARITY_ORDER.indexOf(hero.weapon.rarity);
      if (currentRarityIdx === -1 || currentRarityIdx >= RARITY_ORDER.length - 1) continue;
      const nextRarity = RARITY_ORDER[currentRarityIdx + 1];
      if (nextRarity === "Epic" && tier < 2) continue;
      if (nextRarity === "Legendary" && tier < 3) continue;
      const nextRarityData = WEAPON_RARITY_DATA[nextRarity];
      const upgradeCost = nextRarityData.upgradeCost;
      if (upgradeCost <= 0 || gold < upgradeCost) continue;
      const upgradeWeapons = WEAPONS.filter(w => w.className === hero.className && w.rarity === nextRarity);
      if (upgradeWeapons.length === 0) continue;
      eligible.push({ hero, nextRarity, upgradeCost });
    }
    if (eligible.length > 0) {
      const best = [...eligible].sort((a, b) => RARITY_ORDER.indexOf(a.hero.weapon.rarity) - RARITY_ORDER.indexOf(b.hero.weapon.rarity))[0];
      const heroNames = eligible.map(e => e.hero.name).join(", ");
      const score = RARITY_ORDER.indexOf(best.hero.weapon.rarity) === 0 ? 86 : RARITY_ORDER.indexOf(best.hero.weapon.rarity) === 1 ? 80 : 76;
      suggestions.push({
        type: "weaponUpgrade", name: `Upgrade → ${best.nextRarity}`, cost: best.upgradeCost, score,
        reason: eligible.length === 1
          ? `${best.hero.name}'s ${best.hero.weapon.rarity} weapon → ${best.nextRarity} is a major power boost`
          : `${eligible.length} heroes can upgrade: ${heroNames}`,
        targetHeroId: best.hero.id, categoryIcon: "⚔", categoryColor: "text-fuchsia-300", categoryLabel: "Weapon Upgrade",
      });
    }
  }

  // --- Permanent Upgrades ---
  const hpIncreaseCount = (heroId: string) =>
    state.party.heroes.find(h => h.id === heroId)?.upgrades.filter(u => u.name === "HP Increase").length ?? 0;
  const hasLuckyDice = (heroId: string) =>
    state.party.heroes.find(h => h.id === heroId)?.upgrades.some(u => u.name === "Lucky Dice") ?? false;
  const totalExtraPockets = state.party.heroes.flatMap(h => h.upgrades).filter(u => u.name === "Extra Pocket").length;
  const hasPartyFund = state.party.heroes.some(h => h.upgrades.some(u => u.name === "Party Fund"));

  for (const upg of merchant.permanentUpgrades) {
    if (gold < upg.cost) continue;

    if (upg.name === "HP Increase") {
      const candidates = living.filter(h => hpIncreaseCount(h.id) < 3);
      if (candidates.length === 0) continue;
      const target = [...candidates].sort((a, b) => a.maxHp - b.maxHp)[0];
      const score = target.maxHp <= 10 ? 79 : 64;
      suggestions.push({
        type: "upgrade", name: upg.name, cost: upg.cost, score,
        reason: `${target.name} has ${target.maxHp} HP — +2 max HP improves survivability`,
        targetHeroId: target.id, categoryIcon: "⬆", categoryColor: "text-amber-300", categoryLabel: "Upgrade",
      });
    } else if (upg.name === "Lucky Dice") {
      const candidates = living.filter(h => !hasLuckyDice(h.id));
      if (candidates.length === 0) continue;
      const target = candidates[0];
      suggestions.push({
        type: "upgrade", name: upg.name, cost: upg.cost, score: 73,
        reason: `+1 to all rolls for ${target.name} — consistently strong`,
        targetHeroId: target.id, categoryIcon: "⬆", categoryColor: "text-amber-300", categoryLabel: "Upgrade",
      });
    } else if (upg.name === "Extra Pocket") {
      if (totalExtraPockets >= 2) continue;
      const atCapacity = living.filter(h => {
        const ep = h.upgrades.filter(u => u.name === "Extra Pocket").length;
        return h.items.length >= 3 + ep;
      });
      if (atCapacity.length > 0) {
        suggestions.push({
          type: "upgrade", name: upg.name, cost: upg.cost, score: 68,
          reason: `${atCapacity.length} hero${atCapacity.length > 1 ? "es" : ""} at item capacity — extra slot enables more consumables`,
          targetHeroId: atCapacity[0].id, categoryIcon: "⬆", categoryColor: "text-amber-300", categoryLabel: "Upgrade",
        });
      } else {
        suggestions.push({
          type: "upgrade", name: upg.name, cost: upg.cost, score: 52,
          reason: `More item capacity is always useful for the party`,
          targetHeroId: living[0]?.id, categoryIcon: "⬆", categoryColor: "text-amber-300", categoryLabel: "Upgrade",
        });
      }
    } else if (upg.name === "Party Fund") {
      if (hasPartyFund) continue;
      const totalMerchantValue =
        merchant.items.reduce((s, i) => s + i.cost, 0) +
        merchant.weapons.reduce((s, w) => s + w.cost, 0) +
        merchant.permanentUpgrades.reduce((s, u) => s + u.cost, 0);
      if (totalMerchantValue > 400) {
        suggestions.push({
          type: "upgrade", name: upg.name, cost: upg.cost, score: 58,
          reason: `10% discount on all future purchases — pays for itself quickly`,
          targetHeroId: living[0]?.id, categoryIcon: "⬆", categoryColor: "text-amber-300", categoryLabel: "Upgrade",
        });
      }
    }
  }

  // --- Consumable Items ---
  const allItems = living.flatMap(h => h.items);
  const hasPotion = allItems.some(i => itemHasTag(i, "healing"));
  const hasGuardianAngel = allItems.some(i => itemHasTag(i, "guardian_angel"));
  const hasBomb = allItems.some(i => itemHasTag(i, "bomb"));
  const hasSmokeBomb = allItems.some(i => itemHasTag(i, "smoke_bomb"));
  const hasAbilityBlocker = allItems.some(i => itemHasTag(i, "ability_blocker"));
  const hasPowerScroll = allItems.some(i => itemHasTag(i, "power_scroll"));
  const hasShieldCharm = allItems.some(i => itemHasTag(i, "shield_charm"));
  const hasTreasureMap = allItems.some(i => itemHasTag(i, "treasure_map"));
  const hasSpeedPotion = allItems.some(i => itemHasTag(i, "speed_potion"));
  const hasLuckyCharm = allItems.some(i => itemHasTag(i, "lucky_charm"));
  const hasMysticRune = allItems.some(i => itemHasTag(i, "mystic_rune"));

  for (const item of merchant.items) {
    if (gold < item.cost || item.quantity <= 0) continue;
    const heroesWithSpace = living.filter(h => {
      const ep = h.upgrades.filter(u => u.name === "Extra Pocket").length;
      return h.items.length < 3 + ep;
    });
    if (heroesWithSpace.length === 0) continue;

    let score = 0;
    let reason = "";

    if (ITEMS[item.name as keyof typeof ITEMS]?.itemId === "minor_potion" && !hasPotion && injuredHeroes.length > 0) {
      score = 71; reason = `No healing potions in inventory — ${injuredHeroes.length} hero${injuredHeroes.length > 1 ? "es" : ""} damaged`;
    } else if (ITEMS[item.name as keyof typeof ITEMS]?.itemId === "guardian_angel" && !hasGuardianAngel && tier >= 2) {
      score = 76; reason = `No revive safety net — Guardian Angel prevents a full party wipe`;
    } else if (ITEMS[item.name as keyof typeof ITEMS]?.itemId === "bomb" && !hasBomb) {
      score = tier >= 2 ? 66 : 56; reason = `AoE damage is valuable against groups${tier >= 2 ? " in the upper Astrilith" : ""}`;
    } else if (ITEMS[item.name as keyof typeof ITEMS]?.itemId === "power_scroll" && !hasPowerScroll) {
      score = 61; reason = `+3 damage burst can secure a kill in a tight fight`;
    } else if (ITEMS[item.name as keyof typeof ITEMS]?.itemId === "shield_charm" && !hasShieldCharm) {
      const guardian = living.find(h => h.className === "Guardian");
      score = guardian ? 66 : 56;
      reason = guardian ? `Shield Charm synergizes with ${guardian.name}'s Guardian kit` : `Emergency shields for any hero`;
    } else if (ITEMS[item.name as keyof typeof ITEMS]?.itemId === "ability_blocker" && !hasAbilityBlocker && tier >= 2) {
      score = 63; reason = `Negating a monster special can save a fight in Tier ${tier}+`;
    } else if (ITEMS[item.name as keyof typeof ITEMS]?.itemId === "smoke_bomb" && !hasSmokeBomb && tier >= 2) {
      score = 59; reason = `Escape option for unwinnable fights in the upper Astrilith`;
    } else if (ITEMS[item.name as keyof typeof ITEMS]?.itemId === "treasure_map" && !hasTreasureMap) {
      score = 50; reason = `Double gold from next room — investment that pays off`;
    } else if (ITEMS[item.name as keyof typeof ITEMS]?.itemId === "speed_potion" && !hasSpeedPotion) {
      score = 57; reason = `Extra turn can turn the tide of a difficult combat`;
    } else if (ITEMS[item.name as keyof typeof ITEMS]?.itemId === "lucky_charm" && !hasLuckyCharm) {
      score = 53; reason = `Reroll capability is universally useful`;
    } else if (ITEMS[item.name as keyof typeof ITEMS]?.itemId === "mystic_rune" && !hasMysticRune) {
      score = 53; reason = `Activate specialization ability on demand`;
    }

    if (score > 0) {
      suggestions.push({
        type: "item", name: item.name, cost: item.cost, score, reason,
        targetHeroId: heroesWithSpace[0]?.id, categoryIcon: "🧪", categoryColor: "text-cyan-300", categoryLabel: "Consumable",
      });
    }
  }

  suggestions.sort((a, b) => b.score - a.score);
  return suggestions.slice(0, 3);
}

export function buyEnchantment(state: GameState, enchantmentName: string, heroId: string): GameState {
  const tier = state.spire.tier;
  const enchData = ENCHANTMENTS[enchantmentName as EnchantmentName];
  if (!enchData) return state;

  let cost = getEnchantmentCost(enchantmentName as EnchantmentName, tier);
  cost = Math.floor(cost * (state.spire.merchantPriceMultiplier ?? 1));
  const hasPartyFund = state.party.heroes.some(h => h.upgrades.some(u => u.name === "Party Fund"));
  if (hasPartyFund) cost = Math.floor(cost * 0.9);
  if (state.party.gold < cost) return state;

  const hero = state.party.heroes.find(h => h.id === heroId);
  if (!hero) return state;
  if (hero.enchantment) return state;

  const newState: GameState = {
    ...state,
    party: {
      ...state.party,
      gold: state.party.gold - cost,
      heroes: state.party.heroes.map(h => {
        if (h.id !== heroId) return h;
        return {
          ...h,
          enchantment: {
            id: generateId("enchant"),
            name: enchantmentName as EnchantmentName,
            effect: enchData.effect,
            slotFree: false,
          } as EnchantmentInstance,
        };
      }),
    },
    stats: { ...state.stats, goldSpent: state.stats.goldSpent + cost },
  };

  return emitEvent(newState, "ITEM_BOUGHT", `${hero.className} purchased ${enchantmentName} enchantment for ${cost}g.`, {
    actorId: heroId,
    details: { enchantmentName, cost, heroName: hero.className },
  });
}

function tryAutoBuyOnce(state: GameState): GameState {
  const living = getLivingHeroes(state);
  if (living.length === 0) return state;

  // --- Priority 1: Permanent Upgrades ---
  // HP Increase (heroes with < 3, lowest maxHp first)
  {
    const candidates = living
      .filter(h => h.upgrades.filter(u => u.name === "HP Increase").length < 3)
      .sort((a, b) => a.maxHp - b.maxHp);
    for (const hero of candidates) {
      const newState = buyUpgrade(state, "HP Increase", hero.id);
      if (newState !== state) return newState;
    }
  }

  // Lucky Dice (heroes without it)
  {
    for (const hero of living) {
      if (hero.upgrades.some(u => u.name === "Lucky Dice")) continue;
      const newState = buyUpgrade(state, "Lucky Dice", hero.id);
      if (newState !== state) return newState;
    }
  }

  // Extra Pocket (max 2 per party, give to hero with most items)
  {
    const totalEP = state.party.heroes.flatMap(h => h.upgrades).filter(u => u.name === "Extra Pocket").length;
    if (totalEP < 2) {
      const hero = [...living].sort((a, b) => b.items.length - a.items.length)[0];
      if (hero) {
        const newState = buyUpgrade(state, "Extra Pocket", hero.id);
        if (newState !== state) return newState;
      }
    }
  }

  // Party Fund (if not owned)
  {
    const hasPF = state.party.heroes.some(h => h.upgrades.some(u => u.name === "Party Fund"));
    if (!hasPF) {
      const newState = buyUpgrade(state, "Party Fund", living[0].id);
      if (newState !== state) return newState;
    }
  }

  // --- Priority 2: Weapon Upgrades (lowest rarity first) ---
  {
    const RARITY_ORD: WeaponRarity[] = ["Common", "Rare", "Epic", "Legendary"];
    const tier = state.spire.tier;
    const eligible = living
      .filter(h => {
        const idx = RARITY_ORD.indexOf(h.weapon.rarity);
        if (idx === -1 || idx >= RARITY_ORD.length - 1) return false;
        const nextR = RARITY_ORD[idx + 1];
        if (nextR === "Epic" && tier < 2) return false;
        if (nextR === "Legendary" && tier < 3) return false;
        const nrd = WEAPON_RARITY_DATA[nextR];
        if (!nrd || nrd.upgradeCost <= 0) return false;
        return WEAPONS.filter(w => w.className === h.className && w.rarity === nextR).length > 0;
      })
      .sort((a, b) => RARITY_ORD.indexOf(a.weapon.rarity) - RARITY_ORD.indexOf(b.weapon.rarity));

    for (const hero of eligible) {
      const newState = upgradeWeapon(state, hero.id);
      if (newState !== state) return newState;
    }
  }

  // --- Priority 3: Enchantments (cheapest first, heroes without one) ---
  {
    if (state.merchant) {
      const heroesWithoutEnch = living.filter(h => !h.enchantment);
      const availableEnchs = [...state.merchant.enchantments].sort((a, b) => a.cost - b.cost);
      for (const ench of availableEnchs) {
        for (const hero of heroesWithoutEnch) {
          const newState = buyEnchantment(state, ench.name, hero.id);
          if (newState !== state) return newState;
        }
      }
    }
  }

  // --- Priority 4: Healing (only if injured or dead) ---
  {
    const injured = living.filter(h => h.currentHp < h.maxHp);
    const heavilyInjured = injured.filter(h => h.currentHp / h.maxHp < 0.5);
    const dead = getDeadHeroes(state);

    if (injured.length > 0 || (dead.length > 0 && state.settings.difficulty !== "hard")) {
      // Revive dead heroes first
      if (dead.length > 0 && state.settings.difficulty !== "hard") {
        const newState = buyHealing(state, "Revive 50%", dead[0].id);
        if (newState !== state) return newState;
      }

      // Full Restore for mass heavy injury
      if (heavilyInjured.length >= 2) {
        const newState = buyHealing(state, "Full Restore");
        if (newState !== state) return newState;
      }

      // Group Heal for multiple injured
      if (injured.length >= 2) {
        const newState = buyHealing(state, "Group Heal");
        if (newState !== state) return newState;
      }

      // First Aid for heavily injured
      if (heavilyInjured.length > 0) {
        const newState = buyHealing(state, "First Aid", heavilyInjured[0].id);
        if (newState !== state) return newState;
      }

      // Patch Up for any injured
      if (injured.length > 0) {
        const newState = buyHealing(state, "Patch Up", injured[0].id);
        if (newState !== state) return newState;
      }
    }
  }

  // --- Priority 5: Consumable Items ---
  {
    if (!state.merchant) return state;
    const itemPriority = [
      "Guardian Angel", "Shield Charm", "Bomb", "Ability Blocker",
      "Power Scroll", "Lucky Charm", "Mystic Rune", "Smoke Bomb",
      "Speed Potion", "Treasure Map", "Minor Potion",
    ];

    const allPartyItemTags = state.party.heroes.flatMap(h => h.items).flatMap(i => {
      const itemData = ITEMS[i.name as keyof typeof ITEMS];
      return itemData?.tags ?? [];
    });

    // First pass: buy items the party doesn't already have
    for (const itemName of itemPriority) {
      const merchantItem = state.merchant.items.find(i => i.name === itemName);
      if (!merchantItem || merchantItem.quantity <= 0) continue;
      const itemData = ITEMS[itemName as keyof typeof ITEMS];
      const itemTag = itemData?.tags[0];
      if (itemTag && allPartyItemTags.includes(itemTag)) continue;

      const heroesWithSpace = living.filter(h => {
        const ep = h.upgrades.filter(u => u.name === "Extra Pocket").length;
        return h.items.length < 3 + ep;
      });
      if (heroesWithSpace.length === 0) continue;

      const newState = buyItem(state, itemName, heroesWithSpace[0].id);
      if (newState !== state) return newState;
    }

    // Second pass: buy duplicates to burn remaining gold
    for (const itemName of itemPriority) {
      const merchantItem = state.merchant.items.find(i => i.name === itemName);
      if (!merchantItem || merchantItem.quantity <= 0) continue;

      const heroesWithSpace = living.filter(h => {
        const ep = h.upgrades.filter(u => u.name === "Extra Pocket").length;
        return h.items.length < 3 + ep;
      });
      if (heroesWithSpace.length === 0) continue;

      const newState = buyItem(state, itemName, heroesWithSpace[0].id);
      if (newState !== state) return newState;
    }
  }

  return state;
}

export function autoBuy(state: GameState): GameState {
  const RESERVE_GOLD = 5;
  const TAX_RATE = 0.05;
  let currentState = state;
  const startGold = state.party.gold;
  let totalTax = 0;
  let maxIterations = 200;

  while (maxIterations-- > 0) {
    if (currentState.party.gold <= RESERVE_GOLD) break;
    if (!currentState.merchant) break;

    const goldBefore = currentState.party.gold;
    const newState = tryAutoBuyOnce(currentState);
    if (newState === currentState) break;

    const purchaseCost = goldBefore - newState.party.gold;
    const tax = Math.ceil(purchaseCost * TAX_RATE);
    totalTax += tax;

    currentState = {
      ...newState,
      party: {
        ...newState.party,
        gold: Math.max(0, newState.party.gold - tax),
      },
      stats: {
        ...newState.stats,
        goldSpent: newState.stats.goldSpent + tax,
      },
    };
  }

  const totalSpent = startGold - currentState.party.gold;
  if (totalSpent > 0) {
    currentState = emitEvent(currentState, "ITEM_BOUGHT", `Auto-buy completed — spent ${totalSpent}g (incl. ${totalTax}g laziness tax). ${currentState.party.gold}g remaining.`, {
      details: { goldSpent: totalSpent, taxPaid: totalTax, remainingGold: currentState.party.gold },
    });
  }

  return currentState;
}

export function leaveMerchant(state: GameState): GameState {
  return {
    ...state,
    phase: "exploration",
    merchant: undefined,
  };
}
