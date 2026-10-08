import type { StoredExperiment } from "../../persistence/experimentDb";

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  completed: { label: "completed", cls: "text-spire-success border-spire-success/40 bg-spire-success/10" },
  running: { label: "running", cls: "text-spire-accent border-spire-accent/40 bg-spire-accent/10" },
  paused: { label: "paused", cls: "text-amber-300 border-amber-300/40 bg-amber-300/10" },
  cancelled: { label: "cancelled", cls: "text-amber-300 border-amber-300/40 bg-amber-300/10" },
  failed: { label: "failed", cls: "text-red-400 border-red-400/40 bg-red-400/10" },
  interrupted: { label: "interrupted", cls: "text-amber-300 border-amber-300/40 bg-amber-300/10" },
  "needs-review": { label: "needs review", cls: "text-red-300 border-red-300/40 bg-red-300/10" },
};

const RESUMABLE = new Set(["paused", "cancelled", "interrupted", "failed"]);

/**
 * Shared experiment history panel for Batch Simulation and Strategy Lab.
 * Shows persisted experiments with status, committed progress, and
 * open/resume/delete actions.
 */
export function ExperimentHistoryPanel({
  experiments,
  onOpen,
  onResume,
  onDelete,
}: {
  experiments: StoredExperiment[];
  onOpen: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="glass-card p-5">
      <h3 className="section-heading mb-3">Experiment History</h3>
      <div className="max-h-56 overflow-y-auto space-y-1.5">
        {experiments.slice(0, 25).map((exp) => {
          const badge = STATUS_BADGES[exp.status] ?? { label: exp.status, cls: "text-spire-muted border-spire-border/40" };
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
              <span className="text-spire-muted tabular-nums">{exp.persistedTasks}/{exp.totalTasks}</span>
              <span className={`px-2 py-0.5 rounded border text-[10px] ${badge.cls}`}>{badge.label}</span>
              {RESUMABLE.has(exp.status) && exp.persistedTasks < exp.totalTasks && (
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
