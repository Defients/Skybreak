interface Props {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onStep: () => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  stepCount: number;
  phaseLabel: string;
  roundLabel?: string;
}

export function SimulationControls({
  isPlaying,
  onTogglePlay,
  onStep,
  speed,
  onSpeedChange,
  stepCount,
  phaseLabel,
  roundLabel,
}: Props) {
  return (
    <div className="glass-panel p-3 sm:p-4 flex items-center justify-between sticky top-14 z-40 flex-wrap gap-2 mb-4">
      <div className="flex items-center gap-3">
        <span className="text-lg">🤖</span>
        <div>
          <div className="text-sm font-display gold-text">Simulation Mode</div>
          <div className="text-[10px] text-spire-muted">
            Step {stepCount} · {phaseLabel}
            {roundLabel ? ` · ${roundLabel}` : ""}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          className="btn-ghost text-xs px-3 py-1.5 min-h-[36px]"
          onClick={onTogglePlay}
        >
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>
        <button
          className="btn-ghost text-xs px-3 py-1.5 min-h-[36px]"
          onClick={onStep}
        >
          ⏭ Step
        </button>
        <div className="flex gap-1 ml-1">
          {[1, 2, 4, 8].map((s) => (
            <button
              key={s}
              className={`text-[10px] px-2 py-1 rounded transition-colors min-h-[32px] min-w-[32px] ${
                speed === s
                  ? "bg-spire-accent text-white"
                  : "bg-spire-bg text-spire-muted hover:text-spire-white"
              }`}
              onClick={() => onSpeedChange(s)}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
