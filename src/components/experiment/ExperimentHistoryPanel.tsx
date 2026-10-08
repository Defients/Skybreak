import { useRef } from "react";
import type { StoredExperiment } from "../../persistence/experimentDb";

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  completed: { label: "completed", cls: "text-spire-success border-spire-success/40 bg-spire-success/10" },
  "completed-with-errors": { label: "completed w/ errors", cls: "text-amber-300 border-amber-300/40 bg-amber-300/10" },
  running: { label: "running", cls: "text-spire-accent border-spire-accent/40 bg-spire-accent/10" },
  paused: { label: "paused", cls: "text-amber-300 border-amber-300/40 bg-amber-300/10" },
  cancelled: { label: "cancelled", cls: "text-amber-300 border-amber-300/40 bg-amber-300/10" },
  failed: { label: "failed", cls: "text-red-400 border-red-400/40 bg-red-400/10" },
  interrupted: { label: "interrupted", cls: "text-amber-300 border-amber-300/40 bg-amber-300/10" },
  incompatible: { label: "incompatible", cls: "text-red-300 border-red-300/40 bg-red-300/10" },
  imported: { label: "imported", cls: "text-spire-muted border-spire-border/40 bg-spire-bg/40" },
};

const RESUMABLE = new Set(["paused", "cancelled", "interrupted", "failed", "running", "completed-with-errors"]);

function isLockedElsewhere(exp: StoredExperiment): boolean {
  return !!exp.ownerToken && (exp.leaseUntil ?? 0) > Date.now();
}

/**
 * Shared experiment history panel for Batch Simulation and Strategy Lab.
 * Shows persisted experiments with status, committed progress, and
 * open/resume/delete actions. Cross-tab ownership is disclosed — a live
 * lease means another tab is coordinating that experiment.
 */
export function ExperimentHistoryPanel({
  experiments,
  onOpen,
  onResume,
  onDelete,
  onImportFile,
}: {
  experiments: StoredExperiment[];
  onOpen: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
  onImportFile?: (file: File) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="section-heading">Experiment History</h3>
        {onImportFile && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              data-testid="evidence-import-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportFile(f);
                e.target.value = "";
              }}
            />
            <button
              className="px-2 py-1 rounded border border-spire-border/40 text-[10px] text-spire-muted hover:text-spire-gold hover:border-spire-gold/40 transition-colors"
              onClick={() => fileRef.current?.click()}
              title="Import a skybreak-evidence JSON package (read-only)"
            >
              ⬆ Import Evidence
            </button>
          </>
        )}
      </div>
      <div className="max-h-56 overflow-y-auto space-y-1.5">
        {experiments.length === 0 && (
          <div className="text-xs text-spire-muted/60 py-3 text-center">No persisted experiments yet.</div>
        )}
        {experiments.slice(0, 25).map((exp) => {
          const badge = STATUS_BADGES[exp.status] ?? { label: exp.status, cls: "text-spire-muted border-spire-border/40" };
          const locked = isLockedElsewhere(exp);
          return (
            <div key={exp.id} className="flex items-center gap-3 text-xs border-b border-spire-border/10 pb-1.5">
              <button
                className="flex-1 text-left hover:text-spire-gold transition-colors truncate"
                onClick={() => onOpen(exp.id)}
                title={exp.id}
              >
                <span className="text-spire-white font-medium">{exp.name || exp.id}</span>
                <span className="text-spire-muted/60 ml-2">{new Date(exp.createdAt).toLocaleString()}</span>
              </button>
              {locked && (
                <span className="text-[9px] text-spire-accent/80" title={`Owned by another tab (lease until ${new Date(exp.leaseUntil ?? 0).toLocaleTimeString()})`}>
                  🔒 active elsewhere
                </span>
              )}
              <span className="text-spire-muted tabular-nums">{exp.persistedTasks}/{exp.totalTasks}</span>
              <span className={`px-2 py-0.5 rounded border text-[10px] ${badge.cls}`}>{badge.label}</span>
              {RESUMABLE.has(exp.status) && !locked && (
                <button
                  className="px-2 py-0.5 rounded border border-spire-accent/40 text-spire-accent hover:bg-spire-accent/10 text-[10px]"
                  onClick={() => onResume(exp.id)}
                >
                  Resume
                </button>
              )}
              <button
                className="text-spire-muted/40 hover:text-red-400 transition-colors px-1"
                onClick={() => onDelete(exp.id)}
                title="Delete experiment"
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
