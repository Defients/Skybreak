import { useState } from "react";
import { useGameStore } from "../../app/gameStore";
import { getLivingHeroes } from "../../engine/rulesEngine";
import { CLASS_TEXT_COLORS } from "../../utils/nameResolver";
import { HeroIcon } from "../ui/HeroIcon";
import { ApcText } from "../ui/ApcText";

export function SandboxPanel() {
  const state = useGameStore((s) => s.state);
  const doManualOverride = useGameStore((s) => s.doManualOverride);
  const doForceCombatResult = useGameStore((s) => s.doForceCombatResult);
  const doResolveRoom = useGameStore((s) => s.doResolveRoom);
  const doAdvanceRoom = useGameStore((s) => s.doAdvanceRoom);
  const [expanded, setExpanded] = useState(false);
  const [goldInput, setGoldInput] = useState("");
  const [hpHeroId, setHpHeroId] = useState("");
  const [hpInput, setHpInput] = useState("");

  if (!state) return null;

  const livingHeroes = getLivingHeroes(state);

  const applyGold = () => {
    const val = parseInt(goldInput);
    if (!isNaN(val)) {
      doManualOverride("party.gold", val);
      setGoldInput("");
    }
  };

  const applyHp = () => {
    const val = parseInt(hpInput);
    if (!isNaN(val) && hpHeroId) {
      const hero = state.party.heroes.find((h) => h.id === hpHeroId);
      if (hero) {
        doManualOverride(`party.heroes.${state.party.heroes.indexOf(hero)}.currentHp`, Math.max(0, val));
        setHpInput("");
      }
    }
  };

  const skipRoom = () => {
    doManualOverride("spire.currentRoom.resolved", true);
    doAdvanceRoom();
  };

  if (!expanded) {
    return (
      <button
        className="btn-ghost text-xs px-3 py-1.5 w-full"
        onClick={() => setExpanded(true)}
      >
        🧪 Sandbox Tools ▸
      </button>
    );
  }

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-display gold-text flex items-center gap-1.5">🧪 Sandbox Tools</h3>
        <button
          className="text-xs text-spire-muted hover:text-spire-white"
          onClick={() => setExpanded(false)}
        >
          ▾ Collapse
        </button>
      </div>

      {/* Gold editor */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-spire-muted">Party Gold</label>
        <div className="flex gap-2">
          <input
            className="input flex-1 text-xs"
            type="number"
            placeholder={String(state.party.gold)}
            value={goldInput}
            onChange={(e) => setGoldInput(e.target.value)}
          />
          <button className="btn-primary text-xs px-3 py-1" onClick={applyGold}>Set</button>
        </div>
      </div>

      {/* HP editor */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-spire-muted">Hero HP</label>
        <div className="flex gap-2">
          <select
            className="input flex-1 text-xs"
            value={hpHeroId}
            onChange={(e) => setHpHeroId(e.target.value)}
          >
            <option value="">Select hero...</option>
            {state.party.heroes.map((h) => (
              <option key={h.id} value={h.id}>{h.name} ({h.currentHp}/{h.maxHp})</option>
            ))}
          </select>
          <input
            className="input w-20 text-xs"
            type="number"
            placeholder="HP"
            value={hpInput}
            onChange={(e) => setHpInput(e.target.value)}
          />
          <button className="btn-primary text-xs px-3 py-1" onClick={applyHp}>Set</button>
        </div>
      </div>

      {/* Combat controls */}
      {state.combat && !state.combat.combatResult && (
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-spire-muted">Force Combat Result</label>
          <div className="flex gap-2">
            <button
              className="btn-primary text-xs px-3 py-1 bg-spire-success hover:bg-spire-success/80"
              onClick={() => doForceCombatResult("victory")}
            >
              Force Victory
            </button>
            <button
              className="btn-primary text-xs px-3 py-1 bg-spire-danger hover:bg-spire-danger/80"
              onClick={() => doForceCombatResult("defeat")}
            >
              Force Defeat
            </button>
            <button
              className="btn-ghost text-xs px-3 py-1"
              onClick={() => doForceCombatResult("retreat")}
            >
              Force Retreat
            </button>
          </div>
        </div>
      )}

      {/* Room controls */}
      <div className="space-y-1.5">
        <label className="text-[10px] uppercase tracking-wider text-spire-muted">Room Controls</label>
        <div className="flex gap-2">
          <button className="btn-ghost text-xs px-3 py-1" onClick={skipRoom}>
            ⏭ Skip Room
          </button>
          {state.combat?.combatResult && (
            <button className="btn-ghost text-xs px-3 py-1" onClick={() => doResolveRoom()}>
              Resolve Room
            </button>
          )}
        </div>
      </div>

      {/* Hero quick info */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-spire-muted">Party Overview</label>
        <div className="grid grid-cols-3 gap-2">
          {state.party.heroes.map((h) => (
            <div key={h.id} className={`text-[10px] p-1.5 rounded bg-spire-bg/40 ${!h.alive ? "opacity-40" : ""}`}>
              <div className={`font-medium truncate ${CLASS_TEXT_COLORS[h.className] ?? "text-spire-white"}`}>
                {h.name}
              </div>
              <div className="text-spire-muted">{h.currentHp}/{h.maxHp} HP</div>
              <div className="text-spire-gold">{h.apcs.length} <ApcText>APCs</ApcText></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
