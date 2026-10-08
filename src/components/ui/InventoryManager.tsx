import { useState } from "react";
import { useGameStore } from "../../app/gameStore";
import { hasOverCapacityInventory } from "../../engine/inventoryEngine";

export function InventoryManager() {
  const state = useGameStore(s => s.state);
  const move = useGameStore(s => s.doMoveInventoryItem);
  const discard = useGameStore(s => s.doDiscardInventoryItem);
  const error = useGameStore(s => s.actionError);
  const [pendingDiscard, setPendingDiscard] = useState<string | null>(null);
  if (!state) return null;
  const stores = [...state.party.heroes.map(h => ({ id: h.id, name: h.name, items: h.items, capacity: 3 + h.upgrades.filter(u => u.name === "Extra Pocket").length })), { id: "shared", name: "Shared inventory", items: state.party.sharedInventory, capacity: state.party.sharedInventoryLimit }];
  return <details className="glass-card p-4" open={hasOverCapacityInventory(state) || !!error}>
    <summary className="cursor-pointer font-display text-spire-accent">Manage inventory — give, share, or discard consumables</summary>
    {hasOverCapacityInventory(state) && <p className="text-xs text-spire-warning mt-2">Resolve excess slots or per-hero item limits before leaving. Give an item to another hero, use shared storage, or discard a stack.</p>}
    {error && <p role="alert" className="text-sm text-spire-warning mt-2">{error}</p>}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
      {stores.map(owner => <div key={owner.id} className="border border-spire-border/40 rounded-lg p-3 space-y-2 min-w-0">
        <h3 className="text-sm text-spire-white">{owner.name}: {owner.items.length}/{owner.capacity} slots</h3>
        {!owner.items.length && <p className="text-xs text-spire-muted">Empty</p>}
        {owner.items.map(item => <div key={item.id} className="text-xs space-y-1 border-t border-spire-border/20 pt-2">
          <div className="text-spire-white">{item.name} ×{item.quantity}</div>
          <div className="flex flex-wrap gap-2">
            <select className="input text-xs max-w-full" value="" aria-label={`Move ${item.name} from ${owner.name}`} onChange={e => { if (e.target.value) move(item.id, e.target.value === "shared" ? undefined : e.target.value); }}>
              <option value="">Give to…</option>
              {stores.filter(s => s.id !== owner.id && (s.id === "shared" || state.party.heroes.find(h => h.id === s.id)?.alive)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="btn-ghost text-xs" onClick={() => setPendingDiscard(item.id)}>Discard {item.name}</button>
          </div>
          {pendingDiscard === item.id && <div className="flex flex-wrap items-center gap-2 text-spire-warning">
            <span>Discard this entire stack permanently?</span>
            <button className="btn-ghost text-xs" onClick={() => setPendingDiscard(null)}>Keep</button>
            <button className="btn-ghost text-xs" onClick={() => { discard(item.id); setPendingDiscard(null); }}>Confirm discard</button>
          </div>}
        </div>)}
      </div>)}
    </div>
  </details>;
}
