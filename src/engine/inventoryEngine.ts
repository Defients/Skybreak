import type { GameState } from "../types/gameState";
import { emitEvent } from "./eventLog";
import { resolveItemData } from "../data/items";

export function hasOverCapacityInventory(state: GameState): boolean {
  return state.party.sharedInventory.length > state.party.sharedInventoryLimit || state.party.heroes.some(h =>
    h.items.length > 3 + h.upgrades.filter(u => u.name === "Extra Pocket").length ||
    h.items.some(item => h.items.filter(i => i.itemId === item.itemId).reduce((n, i) => n + i.quantity, 0) > (resolveItemData(item)?.stackLimit ?? item.stackLimit)));
}

/** Move an existing item instance intact; undefined recipient is shared storage. */
export function moveInventoryItem(state: GameState, itemId: string, recipientId?: string): GameState {
  const owner = state.party.heroes.find(h => h.items.some(i => i.id === itemId));
  const item = owner?.items.find(i => i.id === itemId) ?? state.party.sharedInventory.find(i => i.id === itemId);
  if (!item || (owner ? owner.id === recipientId : !recipientId)) return state;
  const recipient = state.party.heroes.find(h => h.id === recipientId);
  if (recipientId && (!recipient?.alive || recipient.items.length >= 3 + recipient.upgrades.filter(u => u.name === "Extra Pocket").length || recipient.items.filter(i => i.itemId === item.itemId).reduce((n, i) => n + i.quantity, 0) + item.quantity > item.stackLimit)) return state;
  if (!recipientId && state.party.sharedInventory.length >= state.party.sharedInventoryLimit) return state;
  const next: GameState = { ...state, party: { ...state.party,
    heroes: state.party.heroes.map(h => ({ ...h, items: h.id === owner?.id ? h.items.filter(i => i.id !== itemId) : h.id === recipientId ? [...h.items, item] : h.items })),
    sharedInventory: recipientId ? state.party.sharedInventory.filter(i => i.id !== itemId) : [...state.party.sharedInventory, item],
  } };
  return emitEvent(next, "INVENTORY_CHANGED", `${item.name} moved to ${recipient?.name ?? "shared inventory"}.`, { details: { operation: "transfer", itemId, recipientId } });
}

/** Discard consumables only. Weapons and permanent upgrades have no path here. */
export function discardInventoryItem(state: GameState, itemId: string): GameState {
  const item = [...state.party.sharedInventory, ...state.party.heroes.flatMap(h => h.items)].find(i => i.id === itemId);
  if (!item) return state;
  const next = { ...state, party: { ...state.party, sharedInventory: state.party.sharedInventory.filter(i => i.id !== itemId), heroes: state.party.heroes.map(h => ({ ...h, items: h.items.filter(i => i.id !== itemId) })) } };
  return emitEvent(next, "INVENTORY_CHANGED", `${item.name} discarded (${item.quantity}).`, { details: { operation: "discard", itemId } });
}
