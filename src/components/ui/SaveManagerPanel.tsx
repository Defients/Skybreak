import { useState, useRef, useCallback, useEffect } from "react";
import type { SaveData } from "../../types/gameState";
import {
  getAllSaves,
  deleteSave,
  getAutosave,
  exportSave,
  importSave,
  clearAllSaves,
} from "../../engine/saveLoad";
import { useGameStore } from "../../app/gameStore";
import { useAudio } from "../../audio/useAudio";
import { formatTier, formatDifficulty } from "../../utils/format";

interface SaveManagerPanelProps {
  onClose: () => void;
}

export function SaveManagerPanel({ onClose }: SaveManagerPanelProps) {
  const state = useGameStore((s) => s.state);
  const doLoadState = useGameStore((s) => s.doLoadState);
  const doSaveGame = useGameStore((s) => s.doSaveGame);
  const doResetGame = useGameStore((s) => s.doResetGame);
  const { playSfx } = useAudio();

  const [saves, setSaves] = useState<SaveData[]>([]);
  const [autosave, setAutosave] = useState<SaveData | null>(null);
  const [saveName, setSaveName] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshSaves = useCallback(() => {
    setSaves(getAllSaves());
    setAutosave(getAutosave());
  }, []);

  useEffect(() => {
    refreshSaves();
  }, [refreshSaves]);

  const handleSave = () => {
    const name = saveName.trim() || `Save ${new Date().toLocaleDateString()}`;
    const success = doSaveGame(name);
    if (success) {
      playSfx("ui", "button_click");
      setSaveName("");
      refreshSaves();
    }
  };

  const handleLoad = (save: SaveData) => {
    playSfx("ui", "button_click");
    doLoadState(save.gameState);
    onClose();
  };

  const handleContinueAutosave = () => {
    if (!autosave) return;
    playSfx("ui", "button_click");
    doLoadState(autosave.gameState);
    onClose();
  };

  const handleDelete = (index: number) => {
    deleteSave(index);
    playSfx("ui", "button_click");
    setShowDeleteConfirm(null);
    refreshSaves();
  };

  const handleExport = () => {
    if (!state) return;
    const json = exportSave(state);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skyward_ascent_${state.meta.seed}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    playSfx("ui", "button_click");
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const loaded = importSave(text);
      if (loaded) {
        playSfx("ui", "button_click");
        doLoadState(loaded);
        onClose();
      } else {
        setImportError("Failed to import save. Invalid or corrupted file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleClearAll = () => {
    clearAllSaves();
    playSfx("ui", "button_click");
    setShowClearConfirm(false);
    refreshSaves();
  };

  const formatSaveInfo = (save: SaveData) => {
    const gs = save.gameState;
    const aliveCount = gs.party.heroes.filter((h) => h.alive).length;
    const heroCount = gs.party.heroes.length;
    return {
      tier: formatTier(gs.spire.tier),
      room: `${gs.spire.roomIndex + 1}/${gs.spire.rooms.length}`,
      gold: gs.party.gold,
      difficulty: formatDifficulty(gs.meta.difficulty),
      mode: gs.meta.mode,
      alive: `${aliveCount}/${heroCount}`,
      phase: gs.phase,
    };
  };

  const isFinished = (save: SaveData) =>
    save.gameState.phase === "victory" || save.gameState.phase === "defeat";

  const renderSaveRow = (save: SaveData, index: number, isAutosave = false) => {
    const info = formatSaveInfo(save);
    const savedDate = new Date(save.savedAt);
    const finished = isFinished(save);

    return (
      <div
        key={`${isAutosave ? "auto" : "manual"}-${index}`}
        className={`rounded-lg border p-3 transition-colors ${
          finished
            ? "bg-spire-bg/20 border-spire-border/20"
            : "bg-spire-bg/40 border-spire-border/30 hover:border-spire-accent/30"
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-spire-white truncate">
                {isAutosave ? "🔄 Autosave" : save.name}
              </span>
              {finished && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-spire-muted/20 text-spire-muted uppercase tracking-wider">
                  {info.phase}
                </span>
              )}
            </div>
            <div className="text-[11px] text-spire-muted flex flex-wrap gap-x-3 gap-y-0.5">
              <span>📍 {info.tier} · Room {info.room}</span>
              <span>💰 {info.gold}g</span>
              <span>💚 {info.alive}</span>
              <span>⚔️ {info.difficulty}</span>
              <span className="text-spire-muted/60">{savedDate.toLocaleDateString()} {savedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!finished && (
              <button
                className="text-xs px-3 py-1.5 rounded-lg bg-spire-accent/15 text-spire-accent border border-spire-accent/30 hover:bg-spire-accent/25 transition-colors"
                onClick={() => isAutosave ? handleContinueAutosave() : handleLoad(save)}
              >
                {isAutosave ? "Continue" : "Load"}
              </button>
            )}
            {!isAutosave && (
              showDeleteConfirm === index ? (
                <div className="flex items-center gap-1">
                  <button
                    className="text-[10px] px-2 py-1 rounded bg-spire-danger/20 text-spire-danger border border-spire-danger/30 hover:bg-spire-danger/30 transition-colors"
                    onClick={() => handleDelete(index)}
                  >
                    Yes
                  </button>
                  <button
                    className="text-[10px] px-2 py-1 rounded bg-spire-bg/40 text-spire-muted border border-spire-border/30 hover:text-spire-white transition-colors"
                    onClick={() => setShowDeleteConfirm(null)}
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  className="text-xs px-2 py-1.5 rounded-lg text-spire-muted hover:text-spire-danger border border-spire-border/20 hover:border-spire-danger/30 transition-colors"
                  onClick={() => setShowDeleteConfirm(index)}
                  title="Delete save"
                >
                  🗑
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative glass-card w-full max-w-lg max-h-[85vh] flex flex-col space-y-4 shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-spire-border/20">
          <h2 className="text-lg font-display gold-text">💾 Save Manager</h2>
          <button
            className="text-spire-muted hover:text-spire-white transition-colors text-lg min-w-[32px] min-h-[32px] flex items-center justify-center"
            onClick={() => { playSfx("ui", "button_click"); onClose(); }}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 space-y-4">
          {/* Autosave section */}
          {autosave && !isFinished(autosave) && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-spire-muted mb-2">Autosave</div>
              {renderSaveRow(autosave, -1, true)}
            </div>
          )}

          {/* Save current run */}
          {state && state.phase !== "victory" && state.phase !== "defeat" && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-spire-muted mb-2">Save Current Run</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  placeholder="Save name (optional)..."
                  className="flex-1 px-3 py-2 rounded-lg bg-spire-bg/50 border border-spire-border/30 text-sm text-spire-white placeholder:text-spire-muted/50 focus:outline-none focus:border-spire-accent/40"
                />
                <button
                  className="btn-gold text-sm px-4 py-2 rounded-lg whitespace-nowrap"
                  onClick={handleSave}
                >
                  💾 Save
                </button>
              </div>
            </div>
          )}

          {/* Manual saves list */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-spire-muted mb-2">
              Saved Games {saves.length > 0 && `(${saves.length})`}
            </div>
            {saves.length === 0 ? (
              <div className="text-sm text-spire-muted/50 text-center py-6 rounded-lg bg-spire-bg/20 border border-spire-border/10">
                No saved games yet
              </div>
            ) : (
              <div className="space-y-2">
                {saves.map((save, i) => renderSaveRow(save, i))}
              </div>
            )}
          </div>

          {/* Import error */}
          {importError && (
            <div className="text-xs text-spire-danger bg-spire-danger/10 border border-spire-danger/20 rounded-lg px-3 py-2">
              {importError}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-spire-border/20 space-y-2">
          <div className="flex gap-2">
            <button
              className="flex-1 text-xs px-3 py-2 rounded-lg bg-spire-bg/40 text-spire-white border border-spire-border/30 hover:border-spire-accent/30 transition-colors"
              onClick={handleExport}
              disabled={!state}
            >
              📤 Export
            </button>
            <button
              className="flex-1 text-xs px-3 py-2 rounded-lg bg-spire-bg/40 text-spire-white border border-spire-border/30 hover:border-spire-accent/30 transition-colors"
              onClick={handleImportClick}
            >
              📥 Import
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              className="hidden"
            />
            {showClearConfirm ? (
              <div className="flex items-center gap-1">
                <button
                  className="text-xs px-3 py-2 rounded-lg bg-spire-danger/20 text-spire-danger border border-spire-danger/30 hover:bg-spire-danger/30 transition-colors"
                  onClick={handleClearAll}
                >
                  Confirm
                </button>
                <button
                  className="text-xs px-3 py-2 rounded-lg bg-spire-bg/40 text-spire-muted border border-spire-border/30 hover:text-spire-white transition-colors"
                  onClick={() => setShowClearConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="text-xs px-3 py-2 rounded-lg text-spire-muted hover:text-spire-danger border border-spire-border/20 hover:border-spire-danger/30 transition-colors"
                onClick={() => setShowClearConfirm(true)}
                disabled={saves.length === 0 && !autosave}
              >
                🗑 Clear All
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
