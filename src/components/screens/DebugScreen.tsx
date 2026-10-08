import { useState } from "react";
import { useGameStore } from "../../app/gameStore";
import { validateState } from "../../engine/validationEngine";
import { DEFAULT_RULINGS } from "../../data/ruleAmbiguities";
import { getSpireImage } from "../../assets/assetRegistry";

interface Props {
  onBack: () => void;
}

export function DebugScreen({ onBack }: Props) {
  const state = useGameStore((s) => s.state);
  const doManualOverride = useGameStore((s) => s.doManualOverride);
  const [overridePath, setOverridePath] = useState("");
  const [overrideValue, setOverrideValue] = useState("");
  const [validationResult, setValidationResult] = useState<{ valid: boolean; warnings: any[] } | null>(null);

  if (!state) {
    return (
      <div className="text-center py-20">
        <p className="text-spire-muted">No game state to inspect.</p>
      </div>
    );
  }

  const runValidation = () => {
    const result = validateState(state);
    setValidationResult(result);
  };

  const stateJson = JSON.stringify(state, null, 2);
  const truncatedJson = stateJson.length > 8000 ? stateJson.substring(0, 8000) + "\n... (truncated)" : stateJson;

  const spireUrl = getSpireImage();

  return (
    <div className="space-y-4 relative">
      {spireUrl && (
        <div
          className="bg-image-overlay"
          style={{ backgroundImage: `url(${spireUrl})`, opacity: 0.08 }}
        />
      )}
      <div className="relative z-10 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display gold-text">🔍 Debug / State Inspector</h2>
        <button className="btn-ghost text-xs" onClick={onBack}>Back to game</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* State summary */}
        <div className="glass-card p-5">
          <h3 className="section-heading mb-3">State Summary</h3>
          <div className="space-y-2 text-xs">
            <DebugRow label="Game ID" value={state.meta.gameId} />
            <DebugRow label="Phase" value={state.phase} />
            <DebugRow label="Seed" value={state.meta.seed} />
            <DebugRow label="RNG Step" value={String(state.rng.step)} />
            <DebugRow label="Tier" value={String(state.spire.tier)} />
            <DebugRow label="Room Index" value={String(state.spire.roomIndex)} />
            <DebugRow label="Gold" value={String(state.party.gold)} />
            <DebugRow label="Heroes Alive" value={String(state.party.heroes.filter(h => h.alive).length)} />
            <DebugRow label="Total Events" value={String(state.log.length)} />
            <DebugRow label="Total Turns" value={String(state.stats.totalTurns)} />
            <DebugRow label="Rooms Cleared" value={String(state.stats.roomsCleared)} />
            <DebugRow label="Perfect Combats" value={String(state.stats.perfectCombats)} />
            <DebugRow label="Deaths" value={String(state.stats.deaths)} />
            <DebugRow label="Revivals" value={String(state.stats.revivals)} />
          </div>
        </div>

        {/* Validation */}
        <div className="glass-card p-5">
          <h3 className="section-heading mb-3">Validation</h3>
          <button className="btn-primary w-full mb-3" onClick={runValidation}>
            Run Validation
          </button>
          {validationResult && (
            <div className="space-y-2">
              <div className={`text-sm font-medium ${validationResult.valid ? "text-spire-success" : "text-spire-danger"}`}>
                {validationResult.valid ? "✓ State is valid" : "✗ State has errors"}
              </div>
              {validationResult.warnings.length === 0 ? (
                <div className="text-xs text-spire-muted">No warnings</div>
              ) : (
                validationResult.warnings.map((w, i) => (
                  <div key={i} className={`text-xs p-2.5 rounded-lg ${w.severity === "error" ? "bg-spire-danger/20" : "bg-spire-warning/20"}`}>
                    <span className="font-medium">{w.severity}:</span> {w.message}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Manual Override */}
      <div className="glass-card p-5">
        <h3 className="section-heading mb-3">Manual Override</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="input flex-1"
            placeholder="path (e.g. party.gold)"
            value={overridePath}
            onChange={(e) => setOverridePath(e.target.value)}
          />
          <input
            className="input flex-1"
            placeholder="value (e.g. 999)"
            value={overrideValue}
            onChange={(e) => setOverrideValue(e.target.value)}
          />
          <button
            className="btn-danger"
            onClick={() => {
              let val: any = overrideValue;
              try { val = JSON.parse(overrideValue); } catch { /* keep as string */ }
              doManualOverride(overridePath, val);
            }}
          >
            Apply
          </button>
        </div>
        <p className="text-xs text-spire-muted mt-2">Use dot notation to access nested properties. Values are parsed as JSON if possible.</p>
      </div>

      {/* Rule Ambiguities */}
      <div className="glass-card p-5">
        <h3 className="section-heading mb-3">Rule Ambiguities & Rulings</h3>
        <div className="space-y-3 max-h-48 overflow-y-auto">
          {DEFAULT_RULINGS.map((ruling) => (
            <div key={ruling.id} className="text-xs border-b border-spire-border/20 pb-3 last:border-0">
              <div className="text-spire-gold font-medium">{ruling.rule}</div>
              <div className="text-spire-muted mt-0.5">{ruling.issue}</div>
              <div className="text-spire-white mt-0.5">→ {ruling.defaultRuling}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Full state JSON */}
      <div className="glass-card p-5">
        <h3 className="section-heading mb-3">Full Game State (JSON)</h3>
        <pre className="text-xs text-spire-muted overflow-x-auto max-h-96 overflow-y-auto bg-spire-bg/60 p-4 rounded-lg font-mono border border-spire-border/40">
          {truncatedJson}
        </pre>
      </div>
      </div>
    </div>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-1 break-all">
      <span className="text-spire-muted">{label}:</span>
      <span className="text-spire-white">{value}</span>
    </div>
  );
}
